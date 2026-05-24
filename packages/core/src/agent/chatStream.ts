import type { LLMClient } from "@mh/core/llm";
import type { AgentRunState, AgentStreamEvent, Plan } from "@mh/core/shared";
import { AgentStreamEventSchema } from "@mh/core/shared";
import { renderFinalMarkdownArtifact, renderPlanMarkdownArtifact } from "./artifacts";
import { createId } from "./helpers";
import { executeActions } from "./nodes/executeActions";
import { runReActPlanning } from "./nodes/runReActPlanning";
import type { ThreadState } from "./runtime";
import type { AgentRuntimeState } from "./state";

export type RunChatTurnInput = {
  runId?: string;
  threadId?: string;
  message: string;
  now: string;
  clientRunId?: string;
  existingThread?: ThreadState;
  llmClient?: LLMClient;
};

const confirmationPattern = /确认|可以|安排|就按|下单|预订|预约/;
const revisionPattern = /改|换|调整|重新|不要|别|取消|预算|地点|时间|晚上|明天|人数|餐厅|活动|孩子|朋友/;

function isConfirmationTurn(input: RunChatTurnInput) {
  if (!confirmationPattern.test(input.message) || revisionPattern.test(input.message)) {
    return false;
  }

  return (
    input.existingThread?.status === "READY_FOR_CONFIRMATION" &&
    Boolean(input.existingThread.pendingConfirmation) &&
    Boolean(input.existingThread.plan)
  );
}

function confirmedPlan(input: RunChatTurnInput): Plan {
  return {
    ...input.existingThread!.plan!,
    requiredActions: input.existingThread!.pendingConfirmation!.actions
  };
}

function base(runId: string, threadId: string, timestamp: string) {
  return { runId, threadId, timestamp };
}

function parseEvent(event: AgentStreamEvent) {
  return AgentStreamEventSchema.parse(event);
}

function createEventQueue() {
  const events: AgentStreamEvent[] = [];
  let ended = false;
  let waiter: (() => void) | undefined;

  function wake() {
    waiter?.();
    waiter = undefined;
  }

  return {
    push(event: AgentStreamEvent) {
      const parsed = parseEvent(event);
      events.push(parsed);
      wake();
    },
    end() {
      ended = true;
      wake();
    },
    async *read() {
      let index = 0;
      while (true) {
        if (index < events.length) {
          const event = events[index];
          index += 1;
          yield event;
          continue;
        }

        if (ended) {
          return;
        }

        await new Promise<void>((resolve) => {
          waiter = resolve;
        });
      }
    }
  };
}

function createBaseState(
  input: RunChatTurnInput,
  threadId: string,
  streamContext: AgentRuntimeState["streamContext"],
  eventSink: AgentRuntimeState["eventSink"]
): AgentRuntimeState {
  return {
    sessionId: threadId,
    userMessage: input.message,
    now: input.now,
    streamContext,
    eventSink,
    llmClient: input.llmClient,
    messages: [],
    toolTraces: [],
    executionReceipts: []
  };
}

function planningState(state: AgentRuntimeState): AgentRunState {
  return state.error ? "PARTIAL_FAILURE" : state.needsUserInput ? "WAITING_FOR_USER" : "READY_FOR_CONFIRMATION";
}

function executionState(state: AgentRuntimeState): AgentRunState {
  const hasFailedRequiredAction =
    state.selectedPlan?.requiredActions.some((action) => action.status === "failed" && !action.optional) ?? true;

  return hasFailedRequiredAction ? "PARTIAL_FAILURE" : "DONE";
}

function pendingPlan(plan: Plan): Plan {
  return {
    ...plan,
    requiredActions: plan.requiredActions.map((action) => ({
      ...action,
      status: "pending"
    }))
  };
}

export async function* runChatTurn(input: RunChatTurnInput): AsyncIterable<AgentStreamEvent> {
  const runId = input.runId ?? input.clientRunId ?? createId("run");
  const threadId = input.threadId ?? createId("sess");
  const timestamp = input.now;
  const queue = createEventQueue();
  const streamContext = base(runId, threadId, timestamp);
  const eventSink = (event: AgentStreamEvent) => queue.push(event);

  void (async () => {
    try {
      if (isConfirmationTurn(input)) {
        const plan = confirmedPlan(input);
        queue.push({
          ...streamContext,
          type: "agent.step",
          phase: "execution",
          title: "执行已确认安排",
          status: "running",
          detail: "开始预约、配送和消息发送",
          display: {
            title: "执行已确认安排",
            summary: "开始预约、配送和消息发送",
            severity: "info",
            artifactRef: "receipts"
          }
        });

        const state: AgentRuntimeState = {
          sessionId: threadId,
          userMessage: input.message,
          now: input.now,
          streamContext,
          eventSink,
          selectedPlan: plan,
          messages: [],
          toolTraces: [],
          executionReceipts: []
        };
        const updates = await executeActions(state);
        const executedState = {
          ...state,
          ...updates
        };
        const runState = executionState(executedState);
        const finalArtifact = executedState.selectedPlan
          ? renderFinalMarkdownArtifact(executedState.selectedPlan, executedState.executionReceipts, {
              updatedAt: input.now,
              toolTraces: executedState.toolTraces
            })
          : undefined;

        /*
         * executeActions emits tool and receipt events through eventSink as each
         * action completes; the merged state is only used for terminal state.
         */
        if (finalArtifact) {
          queue.push({
            ...streamContext,
            type: "artifact.updated",
            artifact: finalArtifact,
            display: {
              title: finalArtifact.title,
              summary: `${executedState.executionReceipts.length} 个执行回执已写入文档。`,
              severity: runState === "DONE" ? "success" : "warning",
              artifactRef: "document"
            }
          });
        }

        queue.push({
          ...streamContext,
          type: "agent.step",
          phase: "execution",
          title: "执行已确认安排",
          status: runState === "DONE" ? "succeeded" : "failed",
          detail: runState,
          display: {
            title: runState === "DONE" ? "执行完成" : "执行部分失败",
            summary: runState,
            severity: runState === "DONE" ? "success" : "warning",
            artifactRef: "receipts"
          }
        });

        queue.push({
          ...streamContext,
          type: "run.completed",
          state: runState
        });
        queue.end();
        return;
      }

      if (!input.threadId) {
        queue.push({
          ...streamContext,
          type: "thread.created"
        });
      }

      queue.push({
        ...streamContext,
        type: "agent.step",
        phase: "intent",
        title: "理解用户需求",
        status: "succeeded",
        detail: input.message,
        display: {
          title: "理解用户需求",
          summary: input.message,
          severity: "success"
        }
      });

      queue.push({
        ...streamContext,
        type: "agent.step",
        phase: "planning",
        title: "规划本地短时活动",
        status: "running",
        detail: "理解目标并编排工具调用",
        display: {
          title: "规划本地短时活动",
          summary: "理解目标并编排工具调用",
          severity: "info"
        }
      });

      const baseState = createBaseState(input, threadId, streamContext, eventSink);
      const planningUpdates = await runReActPlanning(baseState);
      const planned = {
        ...baseState,
        ...planningUpdates,
        selectedPlan: planningUpdates.selectedPlan ? pendingPlan(planningUpdates.selectedPlan) : undefined
      };
      const runState = planningState(planned);

      queue.push({
        ...streamContext,
        type: "agent.step",
        phase: "planning",
        title: "规划本地短时活动",
        status: planned.error ? "failed" : "succeeded",
        detail: planned.selectedPlan?.summary ?? planned.needsUserInput?.question,
        display: {
          title: planned.error ? "规划未完成" : "规划完成",
          summary: planned.selectedPlan?.summary ?? planned.needsUserInput?.question,
          severity: planned.error ? "error" : "success",
          artifactRef: planned.error ? "diagnostics" : "plan"
        }
      });

      const assistantMessage = planned.messages.find((message) => message.role === "assistant");
      if (assistantMessage?.content) {
        queue.push({
          ...streamContext,
          type: "message.delta",
          messageId: assistantMessage.id,
          role: "assistant",
          delta: assistantMessage.content
        });
        queue.push({
          ...streamContext,
          type: "message.completed",
          messageId: assistantMessage.id,
          role: "assistant"
        });
      }

      if (planned.error) {
        queue.push({
          ...streamContext,
          type: "run.failed",
          error: planned.error,
          retryable: planned.error.recoverable,
          display: {
            title: "运行失败",
            summary: planned.error.message,
            items: [{ label: "错误", value: planned.error.code }],
            severity: "error",
            artifactRef: "diagnostics"
          }
        });
        queue.end();
        return;
      }

      if (planned.selectedPlan) {
        const planArtifact = renderPlanMarkdownArtifact(planned.selectedPlan, {
          updatedAt: input.now,
          toolTraces: planned.toolTraces
        });

        queue.push({
          ...streamContext,
          type: "plan.updated",
          plan: planned.selectedPlan,
          display: {
            title: planned.selectedPlan.title,
            summary: planned.selectedPlan.summary,
            items: [
              { label: "时长", value: `${Math.round(planned.selectedPlan.totalDurationMinutes / 60)} 小时` },
              { label: "预算", value: `${planned.selectedPlan.estimatedBudgetCny} 元` },
              { label: "置信度", value: `${Math.round(planned.selectedPlan.confidence * 100)}%` }
            ],
            severity: planned.selectedPlan.risks.some((risk) => risk.severity !== "info") ? "warning" : "success",
            artifactRef: "plan"
          }
        });

        queue.push({
          ...streamContext,
          type: "artifact.updated",
          artifact: planArtifact,
          display: {
            title: planArtifact.title,
            summary: "已生成可确认的 Markdown 方案文档。",
            items: [
              { label: "状态", value: "draft" },
              { label: "来源", value: planned.selectedPlan.id }
            ],
            severity: planned.selectedPlan.risks.some((risk) => risk.severity !== "info") ? "warning" : "success",
            artifactRef: "document"
          }
        });

        queue.push({
          ...streamContext,
          type: "confirmation.required",
          planId: planned.selectedPlan.id,
          summary: planned.selectedPlan.summary,
          actions: planned.selectedPlan.requiredActions,
          display: {
            title: "等待确认",
            summary: planned.selectedPlan.summary,
            items: planned.selectedPlan.requiredActions.map((action) => ({
              label: action.type,
              value: action.toolName,
              status: action.status
            })),
            severity: "info",
            artifactRef: "confirmation"
          }
        });
      }

      queue.push({
        ...streamContext,
        type: "agent.step",
        phase: runState === "READY_FOR_CONFIRMATION" ? "confirmation" : "final",
        title: runState === "READY_FOR_CONFIRMATION" ? "等待用户确认" : "完成本轮",
        status: "succeeded",
        detail: runState,
        display: {
          title: runState === "READY_FOR_CONFIRMATION" ? "等待用户确认" : "完成本轮",
          summary: runState,
          severity: "success",
          artifactRef: runState === "READY_FOR_CONFIRMATION" ? "confirmation" : undefined
        }
      });

      queue.push({
        ...streamContext,
        type: "run.completed",
        state: runState
      });
      queue.end();
    } catch (error) {
      queue.push({
        ...streamContext,
        type: "run.failed",
        error: {
          code: "UNKNOWN",
          message: error instanceof Error ? error.message : "Unknown chat stream failure",
          recoverable: false
        },
        retryable: true,
        display: {
          title: "运行失败",
          summary: error instanceof Error ? error.message : "Unknown chat stream failure",
          severity: "error",
          artifactRef: "diagnostics"
        }
      });
      queue.end();
    }
  })();

  for await (const event of queue.read()) {
    yield event;
  }
}
