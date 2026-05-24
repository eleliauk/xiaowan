import { type AgentRunOutput, type AgentStreamEvent, AgentStreamEventSchema, type ToolCallTrace } from "@mh/shared";
import { createId } from "./helpers";
import { executePlan, runPlanning } from "./index";

export type RunChatTurnInput = {
  threadId?: string;
  message: string;
  now: string;
  clientRunId?: string;
  existingSession?: AgentRunOutput;
};

function isConfirmationTurn(input: RunChatTurnInput) {
  return (
    input.existingSession?.state === "READY_FOR_CONFIRMATION" &&
    Boolean(input.existingSession.plan) &&
    /确认|可以|安排|就按|下单|预订|预约/.test(input.message)
  );
}

function compact(value: unknown) {
  if (value === undefined) {
    return "";
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function base(runId: string, threadId: string, timestamp: string) {
  return { runId, threadId, timestamp };
}

function parseEvent(event: AgentStreamEvent) {
  return AgentStreamEventSchema.parse(event);
}

function toolEvents(trace: ToolCallTrace, runId: string, threadId: string, timestamp: string): AgentStreamEvent[] {
  return [
    parseEvent({
      ...base(runId, threadId, timestamp),
      type: "tool.started",
      toolCallId: trace.id,
      toolName: trace.toolName,
      inputSummary: compact(trace.input)
    }),
    parseEvent({
      ...base(runId, threadId, timestamp),
      type: "tool.finished",
      toolCallId: trace.id,
      toolName: trace.toolName,
      status: trace.status === "succeeded" ? "succeeded" : "failed",
      outputSummary: compact(trace.output),
      error: trace.error
    })
  ];
}

export async function* runChatTurn(input: RunChatTurnInput): AsyncIterable<AgentStreamEvent> {
  const runId = input.clientRunId ?? createId("run");

  if (isConfirmationTurn(input)) {
    const plan = input.existingSession!.plan!;
    const threadId = input.threadId ?? input.existingSession!.sessionId;
    const timestamp = input.now;

    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "agent.step",
      phase: "execution",
      title: "执行已确认安排",
      status: "running",
      detail: "开始预约、配送和消息发送"
    });

    const executed = await executePlan({
      sessionId: threadId,
      plan,
      now: input.now
    });

    for (const trace of executed.toolTraces) {
      for (const event of toolEvents(trace, runId, threadId, timestamp)) {
        yield event;
      }
    }

    for (const receipt of executed.executionReceipts) {
      yield parseEvent({
        ...base(runId, threadId, timestamp),
        type: "execution.receipt",
        receipt
      });
    }

    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "run.completed",
      state: executed.state
    });
    return;
  }

  const planned = await runPlanning({
    sessionId: input.threadId,
    userMessage: input.message,
    now: input.now
  });
  const threadId = planned.sessionId;
  const timestamp = input.now;

  if (!input.threadId) {
    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "thread.created",
      title: planned.plan?.title
    });
  }

  yield parseEvent({
    ...base(runId, threadId, timestamp),
    type: "agent.step",
    phase: "planning",
    title: "规划本地短时活动",
    status: "succeeded",
    detail: planned.plan?.summary ?? planned.needsUserInput?.question
  });

  const assistantMessage = planned.messages.find((message) => message.role === "assistant");
  if (assistantMessage?.content) {
    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "message.delta",
      messageId: assistantMessage.id,
      role: "assistant",
      delta: assistantMessage.content
    });
    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "message.completed",
      messageId: assistantMessage.id,
      role: "assistant"
    });
  }

  for (const trace of planned.toolTraces) {
    for (const event of toolEvents(trace, runId, threadId, timestamp)) {
      yield event;
    }
  }

  if (planned.plan) {
    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "plan.updated",
      plan: planned.plan
    });

    yield parseEvent({
      ...base(runId, threadId, timestamp),
      type: "confirmation.required",
      planId: planned.plan.id,
      summary: planned.plan.summary,
      actions: planned.plan.requiredActions
    });
  }

  yield parseEvent({
    ...base(runId, threadId, timestamp),
    type: "run.completed",
    state: planned.state
  });
}
