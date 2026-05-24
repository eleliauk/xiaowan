import type { ExecutionReceipt, PlanAction } from "@mh/core/shared";
import { toolFinishedDisplay, toolStartedDisplay } from "../display";
import { createId, tracedToolCall } from "../helpers";
import type { AgentRuntimeState } from "../state";

function compact(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

async function emitToolStarted(state: AgentRuntimeState, id: string, action: PlanAction) {
  if (!state.eventSink || !state.streamContext) {
    return;
  }

  await state.eventSink({
    ...state.streamContext,
    type: "tool.started",
    toolCallId: id,
    toolName: action.toolName,
    inputSummary: compact(action.input),
    display: toolStartedDisplay(action.toolName, action.input)
  });
}

async function emitToolFinished(
  state: AgentRuntimeState,
  id: string,
  action: PlanAction,
  output: unknown,
  error?: AgentRuntimeState["error"]
) {
  if (!state.eventSink || !state.streamContext) {
    return;
  }

  await state.eventSink({
    ...state.streamContext,
    type: "tool.finished",
    toolCallId: id,
    toolName: action.toolName,
    status: error ? "failed" : "succeeded",
    outputSummary: output === undefined ? undefined : compact(output),
    error,
    display: toolFinishedDisplay({
      id,
      toolName: action.toolName,
      input: action.input,
      output,
      status: error ? "failed" : "succeeded",
      startedAt: state.now,
      endedAt: state.now,
      error
    })
  });
}

async function emitReceipt(state: AgentRuntimeState, receipt: ExecutionReceipt) {
  if (!state.eventSink || !state.streamContext) {
    return;
  }

  await state.eventSink({
    ...state.streamContext,
    type: "execution.receipt",
    receipt,
    display: {
      title: "执行回执",
      summary: `${receipt.targetName}：${receipt.status}`,
      items: [
        { label: "类型", value: receipt.type },
        { label: "回执", value: receipt.id },
        ...(receipt.time ? [{ label: "时间", value: receipt.time }] : [])
      ],
      severity: receipt.status === "failed" ? "error" : "success",
      artifactRef: "receipts"
    }
  });
}

export async function executeActions(state: AgentRuntimeState): Promise<Partial<AgentRuntimeState>> {
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
    if (action.status === "succeeded" && action.receipt) {
      receipts.push(action.receipt);
      actions.push(action);
      continue;
    }

    const toolCallId = createId("tool");
    const running: PlanAction = { ...action, status: "running" };
    await emitToolStarted(state, toolCallId, action);
    const result = await tracedToolCall(action.toolName, action.input, traces, toolCallId);
    traces = result.toolTraces;
    const trace = traces.at(-1);
    await emitToolFinished(state, toolCallId, action, result.output, trace?.error);

    if (result.output && typeof result.output === "object" && "id" in result.output) {
      const receipt = result.output as ExecutionReceipt;
      receipts.push(receipt);
      await emitReceipt(state, receipt);
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
