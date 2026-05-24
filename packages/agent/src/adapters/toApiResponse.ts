import type { AgentRunOutput } from "@mh/shared";
import type { AgentGraphState } from "../state";

export function toPlanningResponse(state: AgentGraphState): AgentRunOutput {
  return {
    sessionId: state.sessionId,
    state: state.error ? "PARTIAL_FAILURE" : state.needsUserInput ? "WAITING_FOR_USER" : "READY_FOR_CONFIRMATION",
    messages: state.messages,
    plan: state.selectedPlan,
    toolTraces: state.toolTraces,
    needsUserInput: state.needsUserInput,
    executionReceipts: [],
    error: state.error
  };
}

export function toExecutionResponse(state: AgentGraphState): AgentRunOutput {
  const hasFailedRequiredAction =
    state.selectedPlan?.requiredActions.some((action) => action.status === "failed" && !action.optional) ?? true;

  return {
    sessionId: state.sessionId,
    state: hasFailedRequiredAction ? "PARTIAL_FAILURE" : "DONE",
    messages: state.messages,
    plan: state.selectedPlan,
    toolTraces: state.toolTraces,
    executionReceipts: state.executionReceipts,
    error: state.error
  };
}
