import type { AgentRunState, AgentStreamEvent, ExecutionReceipt, Plan, PlanAction, ToolError } from "@mh/shared";

export type ClientMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  completed?: boolean;
};

export type ClientStep = {
  id: string;
  kind: "agent" | "tool";
  title: string;
  status: "running" | "succeeded" | "failed" | "skipped";
  detail?: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: ToolError;
};

export type ClientConfirmation = {
  planId: string;
  summary: string;
  actions: PlanAction[];
};

export type ClientThread = {
  id: string;
  title: string;
  status: AgentRunState | "STREAMING";
  messages: ClientMessage[];
  events: AgentStreamEvent[];
  steps: ClientStep[];
  plan?: Plan;
  confirmation?: ClientConfirmation;
  receipts: ExecutionReceipt[];
  error?: ToolError;
};

export function createEmptyThread(id: string): ClientThread {
  return {
    id,
    title: "新对话",
    status: "WAITING_FOR_USER",
    messages: [],
    events: [],
    steps: [],
    receipts: []
  };
}

function upsertMessage(messages: ClientMessage[], message: ClientMessage) {
  const existing = messages.find((item) => item.id === message.id);
  if (!existing) {
    return [...messages, message];
  }

  return messages.map((item) =>
    item.id === message.id
      ? {
          ...item,
          content: message.content,
          completed: message.completed ?? item.completed
        }
      : item
  );
}

function appendMessageDelta(messages: ClientMessage[], event: Extract<AgentStreamEvent, { type: "message.delta" }>) {
  const existing = messages.find((item) => item.id === event.messageId);
  if (!existing) {
    return [
      ...messages,
      {
        id: event.messageId,
        role: event.role,
        content: event.delta,
        createdAt: event.timestamp
      }
    ];
  }

  return messages.map((item) =>
    item.id === event.messageId
      ? {
          ...item,
          content: item.content + event.delta
        }
      : item
  );
}

function upsertStep(steps: ClientStep[], step: ClientStep) {
  const existing = steps.find((item) => item.id === step.id);
  if (!existing) {
    return [...steps, step];
  }

  return steps.map((item) => (item.id === step.id ? { ...item, ...step } : item));
}

export function applyClientEvent(thread: ClientThread, event: AgentStreamEvent): ClientThread {
  const next = {
    ...thread,
    id: event.threadId,
    events: [...thread.events, event]
  };

  switch (event.type) {
    case "thread.created":
      return {
        ...next,
        title: event.title ?? next.title
      };
    case "message.delta":
      return {
        ...next,
        messages: appendMessageDelta(next.messages, event),
        status: "STREAMING"
      };
    case "message.completed":
      return {
        ...next,
        messages: upsertMessage(next.messages, {
          id: event.messageId,
          role: event.role,
          content: next.messages.find((item) => item.id === event.messageId)?.content ?? "",
          createdAt: event.timestamp,
          completed: true
        })
      };
    case "agent.step":
      return {
        ...next,
        steps: upsertStep(next.steps, {
          id: `${event.runId}:${event.phase}:${event.title}`,
          kind: "agent",
          title: event.title,
          status: event.status,
          detail: event.detail
        })
      };
    case "tool.started":
      return {
        ...next,
        steps: upsertStep(next.steps, {
          id: event.toolCallId,
          kind: "tool",
          title: event.toolName,
          status: "running",
          inputSummary: event.inputSummary
        })
      };
    case "tool.finished":
      return {
        ...next,
        steps: upsertStep(next.steps, {
          id: event.toolCallId,
          kind: "tool",
          title: event.toolName,
          status: event.status,
          outputSummary: event.outputSummary,
          error: event.error
        })
      };
    case "plan.updated":
      return {
        ...next,
        plan: event.plan
      };
    case "confirmation.required":
      return {
        ...next,
        confirmation: {
          planId: event.planId,
          summary: event.summary,
          actions: event.actions
        }
      };
    case "execution.receipt":
      return {
        ...next,
        receipts: [...next.receipts, event.receipt]
      };
    case "run.completed":
      return {
        ...next,
        status: event.state
      };
    case "run.failed":
      return {
        ...next,
        status: "PARTIAL_FAILURE",
        error: event.error
      };
    default:
      return next;
  }
}
