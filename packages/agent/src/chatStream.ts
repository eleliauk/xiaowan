import type { LLMClient } from "@mh/llm";
import { type AgentRunOutput, type AgentStreamEvent, AgentStreamEventSchema, type Plan } from "@mh/shared";
import { toExecutionResponse, toPlanningResponse } from "./adapters/toApiResponse";
import { createId } from "./helpers";
import { executeActions } from "./nodes/executeActions";
import { runReActPlanning } from "./nodes/runReActPlanning";
import { waitForConfirmation } from "./nodes/waitForConfirmation";
import type { ThreadState } from "./runtime";
import type { AgentGraphState } from "./state";

export type RunChatTurnInput = {
  runId?: string;
  threadId?: string;
  message: string;
  now: string;
  clientRunId?: string;
  existingSession?: AgentRunOutput;
  existingThread?: ThreadState;
  llmClient?: LLMClient;
};

const confirmationPattern = /确认|可以|安排|就按|下单|预订|预约/;
const revisionPattern = /改|换|调整|重新|不要|别|取消|预算|地点|时间|晚上|明天|人数|餐厅|活动|孩子|朋友/;

function isConfirmationTurn(input: RunChatTurnInput) {
  if (!confirmationPattern.test(input.message) || revisionPattern.test(input.message)) {
    return false;
  }

  if (input.existingThread) {
    return (
      input.existingThread.status === "READY_FOR_CONFIRMATION" &&
      Boolean(input.existingThread.pendingConfirmation) &&
      Boolean(input.existingThread.plan)
    );
  }

  return input.existingSession?.state === "READY_FOR_CONFIRMATION" && Boolean(input.existingSession.plan);
}

function confirmedPlan(input: RunChatTurnInput): Plan {
  if (input.existingThread?.plan && input.existingThread.pendingConfirmation) {
    return {
      ...input.existingThread.plan,
      requiredActions: input.existingThread.pendingConfirmation.actions
    };
  }

  return input.existingSession!.plan!;
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
  streamContext: AgentGraphState["streamContext"],
  eventSink: AgentGraphState["eventSink"]
): AgentGraphState {
  return {
    sessionId: threadId,
    mode: "plan_only",
    userMessage: input.message,
    now: input.now,
    streamContext,
    eventSink,
    llmClient: input.llmClient,
    candidates: [],
    plannedToolCalls: [],
    messages: [],
    toolTraces: [],
    repairCount: 0,
    loopCount: 0,
    executionReceipts: []
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

        const state: AgentGraphState = {
          sessionId: threadId,
          mode: "execute_confirmed_plan",
          userMessage: input.message,
          now: input.now,
          streamContext,
          eventSink,
          candidates: [],
          plannedToolCalls: [],
          selectedPlan: plan,
          confirmedPlanId: plan.id,
          messages: [],
          toolTraces: [],
          repairCount: 0,
          loopCount: 0,
          executionReceipts: []
        };
        const updates = await executeActions(state);
        const executed = toExecutionResponse({
          ...state,
          ...updates
        });

        /*
         * executeActions emits tool and receipt events through eventSink as each
         * action completes; the response object is only used for final state.
         */
        queue.push({
          ...streamContext,
          type: "agent.step",
          phase: "execution",
          title: "执行已确认安排",
          status: executed.state === "DONE" ? "succeeded" : "failed",
          detail: executed.state,
          display: {
            title: executed.state === "DONE" ? "执行完成" : "执行部分失败",
            summary: executed.state,
            severity: executed.state === "DONE" ? "success" : "warning",
            artifactRef: "receipts"
          }
        });

        queue.push({
          ...streamContext,
          type: "run.completed",
          state: executed.state
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
      const confirmationUpdates = await waitForConfirmation({
        ...baseState,
        ...planningUpdates
      });
      const planned = toPlanningResponse({
        ...baseState,
        ...planningUpdates,
        ...confirmationUpdates
      });

      queue.push({
        ...streamContext,
        type: "agent.step",
        phase: "planning",
        title: "规划本地短时活动",
        status: planned.error ? "failed" : "succeeded",
        detail: planned.plan?.summary ?? planned.needsUserInput?.question,
        display: {
          title: planned.error ? "规划未完成" : "规划完成",
          summary: planned.plan?.summary ?? planned.needsUserInput?.question,
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

      if (planned.plan) {
        queue.push({
          ...streamContext,
          type: "plan.updated",
          plan: planned.plan,
          display: {
            title: planned.plan.title,
            summary: planned.plan.summary,
            items: [
              { label: "时长", value: `${Math.round(planned.plan.totalDurationMinutes / 60)} 小时` },
              { label: "预算", value: `${planned.plan.estimatedBudgetCny} 元` },
              { label: "置信度", value: `${Math.round(planned.plan.confidence * 100)}%` }
            ],
            severity: planned.plan.risks.some((risk) => risk.severity !== "info") ? "warning" : "success",
            artifactRef: "plan"
          }
        });

        queue.push({
          ...streamContext,
          type: "confirmation.required",
          planId: planned.plan.id,
          summary: planned.plan.summary,
          actions: planned.plan.requiredActions,
          display: {
            title: "等待确认",
            summary: planned.plan.summary,
            items: planned.plan.requiredActions.map((action) => ({
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
        phase: planned.state === "READY_FOR_CONFIRMATION" ? "confirmation" : "final",
        title: planned.state === "READY_FOR_CONFIRMATION" ? "等待用户确认" : "完成本轮",
        status: "succeeded",
        detail: planned.state,
        display: {
          title: planned.state === "READY_FOR_CONFIRMATION" ? "等待用户确认" : "完成本轮",
          summary: planned.state,
          severity: "success",
          artifactRef: planned.state === "READY_FOR_CONFIRMATION" ? "confirmation" : undefined
        }
      });

      queue.push({
        ...streamContext,
        type: "run.completed",
        state: planned.state
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
