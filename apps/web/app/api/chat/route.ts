import type { AgentStreamEvent } from "@mh/core/shared";
import { getAgentRuntime } from "../../../lib/agentRuntime";

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ChatRequestBody;
  const userMessage = body.message?.trim();

  if (!userMessage) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const now = body.now ?? new Date().toISOString();
  const abortController = new AbortController();
  const started = getAgentRuntime().startTurn({
    threadId: body.threadId,
    message: userMessage,
    clientRunId: body.clientRunId,
    now,
    abortSignal: abortController.signal
  });

  const stream = new ReadableStream({
    async start(controller) {
      const onAbort = () => abortController.abort();
      request.signal.addEventListener("abort", onAbort, { once: true });

      try {
        for await (const event of started.events) {
          controller.enqueue(encodeSse(event));
        }
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown chat stream failure";
        controller.enqueue(
          encoder.encode(
            `event: run.failed\ndata: ${JSON.stringify({
              type: "run.failed",
              runId: started.runId,
              threadId: started.threadId,
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
      } finally {
        request.signal.removeEventListener("abort", onAbort);
      }
    },
    cancel() {
      abortController.abort();
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
