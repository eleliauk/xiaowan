import type {
  AgentEventDisplay,
  AgentRunState,
  AgentStreamEvent,
  ExecutionReceipt,
  Plan,
  PlanAction,
  ToolError
} from "@mh/shared";

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
  display?: AgentEventDisplay;
  inputSummary?: string;
  outputSummary?: string;
  error?: ToolError;
};

export type ClientConfirmation = {
  planId: string;
  summary: string;
  actions: PlanAction[];
};

export type ClientArtifactPanel = {
  open: boolean;
  selected?: "plan" | "confirmation" | "receipts" | "diagnostics";
};

export type ClientFailure = {
  title: string;
  summary: string;
  error: ToolError;
  display?: AgentEventDisplay;
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
  artifactPanel: ClientArtifactPanel;
  failure?: ClientFailure;
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
    receipts: [],
    artifactPanel: { open: false }
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

function withArtifactPanel(
  thread: ClientThread,
  selected: NonNullable<ClientArtifactPanel["selected"]>
): ClientThread {
  return {
    ...thread,
    artifactPanel: {
      open: true,
      selected
    }
  };
}

function artifactFromDisplay(display?: AgentEventDisplay): NonNullable<ClientArtifactPanel["selected"]> | undefined {
  if (
    display?.artifactRef === "plan" ||
    display?.artifactRef === "confirmation" ||
    display?.artifactRef === "receipts" ||
    display?.artifactRef === "diagnostics"
  ) {
    return display.artifactRef;
  }

  return undefined;
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
          title: event.display?.title ?? event.title,
          status: event.status,
          detail: event.display?.summary ?? event.detail,
          display: event.display
        })
      };
    case "tool.started":
      return {
        ...next,
        steps: upsertStep(next.steps, {
          id: event.toolCallId,
          kind: "tool",
          title: event.display?.title ?? event.toolName,
          status: "running",
          detail: event.display?.summary,
          display: event.display,
          inputSummary: event.display ? undefined : event.inputSummary
        })
      };
    case "tool.finished":
      return {
        ...next,
        steps: upsertStep(next.steps, {
          id: event.toolCallId,
          kind: "tool",
          title: event.display?.title ?? event.toolName,
          status: event.status,
          detail: event.display?.summary,
          display: event.display,
          outputSummary: event.display ? undefined : event.outputSummary,
          error: event.error
        }),
        artifactPanel: artifactFromDisplay(event.display)
          ? { open: true, selected: artifactFromDisplay(event.display) }
          : next.artifactPanel
      };
    case "plan.updated":
      return withArtifactPanel(
        {
          ...next,
          plan: event.plan
        },
        "plan"
      );
    case "confirmation.required":
      return withArtifactPanel(
        {
          ...next,
          confirmation: {
            planId: event.planId,
            summary: event.summary,
            actions: event.actions
          }
        },
        "confirmation"
      );
    case "execution.receipt":
      return withArtifactPanel(
        {
          ...next,
          receipts: [...next.receipts, event.receipt]
        },
        "receipts"
      );
    case "run.completed":
      return {
        ...next,
        status: event.state
      };
    case "run.failed":
      return withArtifactPanel(
        {
          ...next,
          status: "PARTIAL_FAILURE",
          error: event.error,
          failure: {
            title: event.display?.title ?? "运行失败",
            summary: event.display?.summary ?? event.error.message,
            error: event.error,
            display: event.display
          }
        },
        "diagnostics"
      );
    default:
      return next;
  }
}
