import type { AgentMessage, Plan, PlanAction, PlanStep, ToolCallTrace } from "@mh/shared";
import { createDefaultToolRegistry, isToolExecutionError } from "@mh/tools";

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function message(role: AgentMessage["role"], content: string, now: string): AgentMessage {
  return {
    id: createId("msg"),
    role,
    content,
    createdAt: now
  };
}

export async function tracedToolCall(
  toolName: string,
  input: unknown,
  existing: ToolCallTrace[]
) {
  const registry = createDefaultToolRegistry();
  const startedAt = new Date().toISOString();
  const id = createId("tool");

  try {
    const output = await registry.get(toolName).invoke(input, { toolCallId: id, startedAt });
    const trace: ToolCallTrace = {
      id,
      toolName,
      input,
      output,
      status: "succeeded",
      startedAt,
      endedAt: new Date().toISOString()
    };
    return { output, toolTraces: [...existing, trace] };
  } catch (error) {
    const trace: ToolCallTrace = {
      id,
      toolName,
      input,
      status: "failed",
      startedAt,
      endedAt: new Date().toISOString(),
      error: isToolExecutionError(error)
        ? {
            code: error.code,
            message: error.message,
            recoverable: error.recoverable,
            suggestedFallback: error.suggestedFallback
          }
        : {
            code: "UNKNOWN",
            message: error instanceof Error ? error.message : "Unknown tool failure",
            recoverable: false
          }
    };
    return { output: undefined, toolTraces: [...existing, trace] };
  }
}

export function replaceTimelineStep(plan: Plan, stepId: string, step: PlanStep): Plan {
  return {
    ...plan,
    timeline: plan.timeline.map((item) => (item.id === stepId ? step : item))
  };
}

export function updateAction(plan: Plan, actionId: string, update: Partial<PlanAction>): Plan {
  return {
    ...plan,
    requiredActions: plan.requiredActions.map((action) =>
      action.id === actionId ? { ...action, ...update } : action
    )
  };
}
