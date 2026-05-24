import type { ExecutionReceipt, PlanAction } from "@mh/shared";
import { tracedToolCall } from "../helpers";
import type { AgentGraphState } from "../state";

export async function executeActions(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.selectedPlan) {
    return {
      error: {
        code: "VALIDATION_ERROR",
        message: "No confirmed plan to execute",
        recoverable: false
      }
    };
  }

  let traces = state.toolTraces;
  const receipts: ExecutionReceipt[] = [];
  const actions: PlanAction[] = [];

  for (const action of state.selectedPlan.requiredActions) {
    const running: PlanAction = { ...action, status: "running" };
    const result = await tracedToolCall(action.toolName, action.input, traces);
    traces = result.toolTraces;

    if (result.output && typeof result.output === "object" && "id" in result.output) {
      const receipt = result.output as ExecutionReceipt;
      receipts.push(receipt);
      actions.push({ ...running, status: "succeeded", receipt });
    } else {
      actions.push({ ...running, status: action.optional ? "skipped" : "failed" });
    }
  }

  return {
    toolTraces: traces,
    executionReceipts: receipts,
    selectedPlan: {
      ...state.selectedPlan,
      requiredActions: actions
    }
  };
}
