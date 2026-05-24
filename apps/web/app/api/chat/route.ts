import { runChatTurn } from "@mh/agent";
import type { AgentMessage, AgentRunOutput, AgentStreamEvent, ToolCallTrace } from "@mh/shared";
import { getSession, saveSession } from "../../../lib/sessionStore";

type ChatRequestBody = {
  threadId?: string;
  message?: string;
  clientRunId?: string;
  now?: string;
};

const encoder = new TextEncoder();

function encodeSse(event: AgentStreamEvent) {
  return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function message(id: string, role: AgentMessage["role"], content: string, createdAt: string): AgentMessage {
  return { id, role, content, createdAt };
}

function createDraftSession(threadId: string, userMessage: string, now: string, existing?: AgentRunOutput): AgentRunOutput {
  if (existing) {
    return {
      ...existing,
      messages: [
        ...existing.messages,
        message(`msg_user_${Date.now()}`, "user", userMessage, now)
      ]
    };
  }

  return {
    sessionId: threadId,
    state: "WAITING_FOR_USER",
    messages: [message(`msg_user_${Date.now()}`, "user", userMessage, now)],
    toolTraces: [],
    executionReceipts: []
  };
}

function applyEvent(
  session: AgentRunOutput | undefined,
  event: AgentStreamEvent,
  userMessage: string,
  now: string
): AgentRunOutput {
  const next = session ?? createDraftSession(event.threadId, userMessage, now);

  if (event.type === "thread.created") {
    return {
      ...next,
      sessionId: event.threadId
    };
  }

  if (event.type === "message.delta") {
    const existing = next.messages.find((item) => item.id === event.messageId);
    return {
      ...next,
      messages: existing
        ? next.messages.map((item) =>
            item.id === event.messageId ? { ...item, content: item.content + event.delta } : item
          )
        : [...next.messages, message(event.messageId, event.role === "assistant" ? "assistant" : "user", event.delta, event.timestamp)]
    };
  }

  if (event.type === "tool.started") {
    const trace: ToolCallTrace = {
      id: event.toolCallId,
      toolName: event.toolName,
      input: event.inputSummary,
      status: "running",
      startedAt: event.timestamp
    };

    return {
      ...next,
      toolTraces: [...next.toolTraces.filter((item) => item.id !== trace.id), trace]
    };
  }

  if (event.type === "tool.finished") {
    return {
      ...next,
      toolTraces: next.toolTraces.map((trace) =>
        trace.id === event.toolCallId
          ? {
              ...trace,
              status: event.status,
              output: event.outputSummary,
              endedAt: event.timestamp,
              error: event.error
            }
          : trace
      )
    };
  }

  if (event.type === "plan.updated") {
    return {
      ...next,
      plan: event.plan
    };
  }

  if (event.type === "execution.receipt") {
    return {
      ...next,
      executionReceipts: [...next.executionReceipts, event.receipt]
    };
  }

  if (event.type === "run.completed") {
    return {
      ...next,
      state: event.state
    };
  }

  if (event.type === "run.failed") {
    return {
      ...next,
      state: "PARTIAL_FAILURE",
      toolTraces: next.toolTraces,
      needsUserInput: {
        question: event.error.message
      }
    };
  }

  return next;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ChatRequestBody;
  const userMessage = body.message?.trim();

  if (!userMessage) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const now = body.now ?? new Date().toISOString();
  const existingSession = body.threadId ? getSession(body.threadId) : undefined;
  let session = body.threadId
    ? createDraftSession(body.threadId, userMessage, now, existingSession)
    : undefined;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runChatTurn({
          threadId: body.threadId,
          message: userMessage,
          clientRunId: body.clientRunId,
          existingSession,
          now
        })) {
          session = applyEvent(session, event, userMessage, now);
          if (session) {
            saveSession(session);
          }
          controller.enqueue(encodeSse(event));
        }
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown chat stream failure";
        controller.enqueue(
          encoder.encode(
            `event: run.failed\ndata: ${JSON.stringify({
              type: "run.failed",
              runId: body.clientRunId ?? "run_failed",
              threadId: body.threadId ?? "thread_unknown",
              timestamp: now,
              error: {
                code: "UNKNOWN",
                message,
                recoverable: false
              },
              retryable: true
            })}\n\n`
          )
        );
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
