import { createLLMClient } from "@mh/llm";
import { type Plan, PlanSchema } from "@mh/shared";
import type { AgentGraphState } from "../state";

const allowedExecutionTools = new Set(["bookActivity", "reserveRestaurant", "scheduleDelivery", "sendMessage"]);

function unsafePlanReason(plan: Plan) {
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) {
    return parsed.error.message;
  }

  const unsafeAction = parsed.data.requiredActions.find(
    (action) => action.status !== "pending" || Boolean(action.receipt) || !allowedExecutionTools.has(action.toolName)
  );

  if (unsafeAction) {
    return `Unsafe repaired action ${unsafeAction.id}: actions must be pending, receipt-free, and use execution tools only.`;
  }

  return undefined;
}

export async function repairPlan(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal || !state.selectedPlan || !state.planValidation || state.error) {
    return { repairCount: state.repairCount + 1 };
  }

  const client = state.llmClient ?? createLLMClient();

  try {
    const decision = await client.repairPlan({
      goal: state.goal,
      plan: state.selectedPlan,
      validation: state.planValidation,
      toolTraces: state.toolTraces,
      now: state.now
    });

    if (decision.plan) {
      const unsafeReason = unsafePlanReason(decision.plan);
      if (unsafeReason) {
        return {
          repairCount: state.repairCount + 1,
          error: {
            code: "VALIDATION_ERROR",
            message: unsafeReason,
            recoverable: false
          }
        };
      }
    }

    if (!decision.plan && decision.additionalToolCalls.length === 0) {
      return {
        repairCount: state.repairCount + 1,
        error: {
          code: "VALIDATION_ERROR",
          message: "LLM repair returned neither a plan nor additional tool calls",
          recoverable: false
        }
      };
    }

    return {
      repairCount: state.repairCount + 1,
      selectedPlan: decision.plan ?? state.selectedPlan,
      plannedToolCalls: decision.additionalToolCalls,
      loopCount: decision.additionalToolCalls.length > 0 ? state.loopCount + 1 : state.loopCount,
      llmTrace: { provider: client.provider }
    };
  } catch (error) {
    return {
      repairCount: state.repairCount + 1,
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "LLM plan repair failed",
        recoverable: false
      },
      llmTrace: {
        provider: client.provider,
        errorCode:
          error && typeof error === "object" && "code" in error && typeof error.code === "string"
            ? error.code
            : "LLM_RUNTIME_ERROR"
      }
    };
  }
}
