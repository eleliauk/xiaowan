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
    return `Unsafe action ${unsafeAction.id}: actions must be pending, receipt-free, and use execution tools only.`;
  }

  return undefined;
}

export async function composePlan(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal || state.error) {
    return {};
  }

  const client = state.llmClient ?? createLLMClient();

  try {
    const plan = await client.composePlan({
      goal: state.goal,
      toolTraces: state.toolTraces,
      now: state.now
    });
    const unsafeReason = unsafePlanReason(plan);

    if (unsafeReason) {
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: unsafeReason,
          recoverable: false
        },
        selectedPlan: undefined
      };
    }

    return {
      selectedPlan: plan,
      llmTrace: { provider: client.provider }
    };
  } catch (error) {
    return {
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "LLM plan composition failed",
        recoverable: false
      },
      selectedPlan: undefined,
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
