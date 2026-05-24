import type { LLMClient } from "@mh/core/llm";
import type {
  AgentArtifact,
  AgentMessage,
  AgentRunOutput,
  AgentRunState,
  AgentStreamEvent,
  ExecutionReceipt,
  Plan,
  PlanAction,
  ToolCallTrace,
  ToolError
} from "@mh/core/shared";
import { runChatTurn } from "./chatStream";
import { createId } from "./helpers";

export type PendingConfirmation = {
  planId: string;
  summary: string;
  actions: PlanAction[];
};

export type ThreadState = {
  threadId: string;
  title: string;
  status: AgentRunState;
  messages: AgentMessage[];
  events: AgentStreamEvent[];
  toolTraces: ToolCallTrace[];
  plan?: Plan;
  artifacts: AgentArtifact[];
  pendingConfirmation?: PendingConfirmation;
  needsUserInput?: {
    question: string;
    options?: string[];
  };
  receipts: ExecutionReceipt[];
  error?: ToolError;
  createdAt: string;
  updatedAt: string;
};

export type ThreadStore = {
  createThread(input: { threadId?: string; now: string; title?: string }): ThreadState;
  getThread(threadId: string): ThreadState | undefined;
  saveThread(thread: ThreadState): ThreadState;
  appendMessage(threadId: string, message: AgentMessage): ThreadState;
  appendEvent(threadId: string, event: AgentStreamEvent): ThreadState;
  setPlan(threadId: string, plan: Plan): ThreadState;
  setArtifact(threadId: string, artifact: AgentArtifact): ThreadState;
  setPendingConfirmation(threadId: string, confirmation: PendingConfirmation): ThreadState;
  clearPendingConfirmation(threadId: string): ThreadState;
  addReceipt(threadId: string, receipt: ExecutionReceipt): ThreadState;
  setStatus(threadId: string, status: AgentRunState, error?: ToolError): ThreadState;
};

export type RunStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export type RunRecord = {
  runId: string;
  threadId: string;
  clientRunId?: string;
  status: RunStatus;
  abortController: AbortController;
  error?: ToolError;
  createdAt: string;
  updatedAt: string;
};

export type RunManager = {
  createRun(input: { threadId: string; clientRunId?: string; abortController?: AbortController }): RunRecord;
  getRun(runId: string): RunRecord | undefined;
  findRunByClientRunId(threadId: string, clientRunId: string): RunRecord | undefined;
  markRunning(runId: string): RunRecord;
  markSuccess(runId: string): RunRecord;
  markFailed(runId: string, error: ToolError): RunRecord;
  markCancelled(runId: string, error?: ToolError): RunRecord;
};

export type StreamBridge = {
  publish(runId: string, event: AgentStreamEvent): Promise<void>;
  publishEnd(runId: string): Promise<void>;
  subscribe(runId: string, options?: { lastEventId?: string }): AsyncIterable<AgentStreamEvent>;
};

export type ChatTurnInput = {
  threadId?: string;
  message: string;
  clientRunId?: string;
  now: string;
  abortSignal?: AbortSignal;
  llmClient?: LLMClient;
};

export type LocalActivityAgentInput = ChatTurnInput & {
  threadId: string;
  runId: string;
  existingThread?: ThreadState;
};

export type LocalActivityAgent = {
  streamTurn(input: LocalActivityAgentInput): AsyncIterable<AgentStreamEvent>;
};

export type StartedRun = {
  runId: string;
  threadId: string;
  events: AsyncIterable<AgentStreamEvent>;
  reused: boolean;
};

export type LocalActivityRuntime = {
  startTurn(input: ChatTurnInput): StartedRun;
  getThread(threadId: string): ThreadState | undefined;
  getSession(threadId: string): AgentRunOutput | undefined;
  saveSession(session: AgentRunOutput): AgentRunOutput;
};

function cloneThread(thread: ThreadState): ThreadState {
  return {
    ...thread,
    messages: [...thread.messages],
    events: [...thread.events],
    toolTraces: [...thread.toolTraces],
    artifacts: [...thread.artifacts],
    receipts: [...thread.receipts],
    pendingConfirmation: thread.pendingConfirmation
      ? { ...thread.pendingConfirmation, actions: [...thread.pendingConfirmation.actions] }
      : undefined
  };
}

function requireThread(threads: Map<string, ThreadState>, threadId: string) {
  const thread = threads.get(threadId);
  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }
  return thread;
}

export function createInMemoryThreadStore(): ThreadStore {
  const threads = new Map<string, ThreadState>();

  return {
    createThread(input) {
      const now = input.now;
      const thread: ThreadState = {
        threadId: input.threadId ?? createId("thread"),
        title: input.title ?? "新对话",
        status: "WAITING_FOR_USER",
        messages: [],
        events: [],
        toolTraces: [],
        artifacts: [],
        receipts: [],
        createdAt: now,
        updatedAt: now
      };
      threads.set(thread.threadId, thread);
      return cloneThread(thread);
    },

    getThread(threadId) {
      const thread = threads.get(threadId);
      return thread ? cloneThread(thread) : undefined;
    },

    saveThread(thread) {
      threads.set(thread.threadId, cloneThread(thread));
      return cloneThread(thread);
    },

    appendMessage(threadId, message) {
      const thread = requireThread(threads, threadId);
      const next = {
        ...thread,
        messages: [...thread.messages, message],
        updatedAt: message.createdAt
      };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    appendEvent(threadId, event) {
      const thread = requireThread(threads, threadId);
      const next = {
        ...thread,
        events: [...thread.events, event],
        updatedAt: event.timestamp
      };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    setPlan(threadId, plan) {
      const thread = requireThread(threads, threadId);
      const next = { ...thread, plan, updatedAt: thread.updatedAt };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    setArtifact(threadId, artifact) {
      const thread = requireThread(threads, threadId);
      const next = {
        ...thread,
        artifacts: [...thread.artifacts.filter((item) => item.id !== artifact.id), artifact],
        updatedAt: artifact.updatedAt
      };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    setPendingConfirmation(threadId, confirmation) {
      const thread = requireThread(threads, threadId);
      const next = {
        ...thread,
        status: "READY_FOR_CONFIRMATION" as const,
        pendingConfirmation: { ...confirmation, actions: [...confirmation.actions] }
      };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    clearPendingConfirmation(threadId) {
      const thread = requireThread(threads, threadId);
      const { pendingConfirmation: _pendingConfirmation, ...rest } = thread;
      const next = { ...rest };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    addReceipt(threadId, receipt) {
      const thread = requireThread(threads, threadId);
      const next = {
        ...thread,
        receipts: thread.receipts.some((item) => item.id === receipt.id)
          ? thread.receipts
          : [...thread.receipts, receipt]
      };
      threads.set(threadId, next);
      return cloneThread(next);
    },

    setStatus(threadId, status, error) {
      const thread = requireThread(threads, threadId);
      const next = { ...thread, status, error };
      threads.set(threadId, next);
      return cloneThread(next);
    }
  };
}

export function createInMemoryRunManager(options: { now?: () => string } = {}): RunManager {
  const now = options.now ?? (() => new Date().toISOString());
  const runs = new Map<string, RunRecord>();
  const clientRunIndex = new Map<string, string>();

  function save(record: RunRecord) {
    runs.set(record.runId, record);
    if (record.clientRunId) {
      clientRunIndex.set(`${record.threadId}:${record.clientRunId}`, record.runId);
    }
    return record;
  }

  function update(runId: string, update: Partial<RunRecord>) {
    const current = runs.get(runId);
    if (!current) {
      throw new Error(`Run not found: ${runId}`);
    }
    return save({ ...current, ...update, updatedAt: now() });
  }

  return {
    createRun(input) {
      if (input.clientRunId) {
        const existing = clientRunIndex.get(`${input.threadId}:${input.clientRunId}`);
        if (existing) {
          const record = runs.get(existing);
          if (record) {
            return record;
          }
        }
      }

      const timestamp = now();
      return save({
        runId: createId("run"),
        threadId: input.threadId,
        clientRunId: input.clientRunId,
        status: "pending",
        abortController: input.abortController ?? new AbortController(),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    },

    getRun(runId) {
      return runs.get(runId);
    },

    findRunByClientRunId(threadId, clientRunId) {
      const runId = clientRunIndex.get(`${threadId}:${clientRunId}`);
      return runId ? runs.get(runId) : undefined;
    },

    markRunning(runId) {
      return update(runId, { status: "running" });
    },

    markSuccess(runId) {
      return update(runId, { status: "success" });
    },

    markFailed(runId, error) {
      return update(runId, { status: "failed", error });
    },

    markCancelled(runId, error) {
      const record = update(runId, { status: "cancelled", error });
      record.abortController.abort();
      return record;
    }
  };
}

type MemoryStream = {
  events: AgentStreamEvent[];
  ended: boolean;
  waiters: Set<() => void>;
};

function getStream(streams: Map<string, MemoryStream>, runId: string) {
  const existing = streams.get(runId);
  if (existing) {
    return existing;
  }

  const stream: MemoryStream = {
    events: [],
    ended: false,
    waiters: new Set()
  };
  streams.set(runId, stream);
  return stream;
}

function notify(stream: MemoryStream) {
  for (const waiter of stream.waiters) {
    waiter();
  }
  stream.waiters.clear();
}

export function createInMemoryStreamBridge(): StreamBridge {
  const streams = new Map<string, MemoryStream>();

  return {
    async publish(runId, event) {
      const stream = getStream(streams, runId);
      stream.events.push(event);
      notify(stream);
    },

    async publishEnd(runId) {
      const stream = getStream(streams, runId);
      stream.ended = true;
      notify(stream);
    },

    async *subscribe(runId, options = {}) {
      const stream = getStream(streams, runId);
      let index = 0;

      if (options.lastEventId) {
        const match = stream.events.findIndex(
          (event) => `${event.runId}:${stream.events.indexOf(event)}` === options.lastEventId
        );
        index = match >= 0 ? match + 1 : 0;
      }

      while (true) {
        if (index < stream.events.length) {
          const event = stream.events[index];
          index += 1;
          yield event;
          continue;
        }

        if (stream.ended) {
          return;
        }

        await new Promise<void>((resolve) => {
          stream.waiters.add(resolve);
        });
      }
    }
  };
}

function titleFromMessage(messageText: string) {
  return messageText.length > 18 ? `${messageText.slice(0, 18)}...` : messageText || "新对话";
}

function userMessage(content: string, now: string): AgentMessage {
  return {
    id: createId("msg_user"),
    role: "user",
    content,
    createdAt: now
  };
}

function normalizeError(error: unknown): ToolError {
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Unknown runtime failure",
    recoverable: false
  };
}

function upsertAssistantDelta(thread: ThreadState, event: Extract<AgentStreamEvent, { type: "message.delta" }>) {
  const existing = thread.messages.find((message) => message.id === event.messageId);
  const messages = existing
    ? thread.messages.map((message) =>
        message.id === event.messageId ? { ...message, content: message.content + event.delta } : message
      )
    : [
        ...thread.messages,
        {
          id: event.messageId,
          role: event.role,
          content: event.delta,
          createdAt: event.timestamp
        }
      ];

  return { ...thread, messages, updatedAt: event.timestamp };
}

function upsertToolStarted(thread: ThreadState, event: Extract<AgentStreamEvent, { type: "tool.started" }>) {
  const trace: ToolCallTrace = {
    id: event.toolCallId,
    toolName: event.toolName,
    input: event.inputSummary,
    status: "running",
    startedAt: event.timestamp
  };

  return {
    ...thread,
    toolTraces: [...thread.toolTraces.filter((item) => item.id !== trace.id), trace],
    updatedAt: event.timestamp
  };
}

function upsertToolFinished(thread: ThreadState, event: Extract<AgentStreamEvent, { type: "tool.finished" }>) {
  const existing = thread.toolTraces.find((trace) => trace.id === event.toolCallId);
  const finished: ToolCallTrace = {
    id: event.toolCallId,
    toolName: event.toolName,
    input: existing?.input,
    status: event.status,
    startedAt: existing?.startedAt ?? event.timestamp,
    endedAt: event.timestamp,
    output: event.outputSummary,
    error: event.error
  };

  return {
    ...thread,
    toolTraces: [...thread.toolTraces.filter((item) => item.id !== event.toolCallId), finished],
    updatedAt: event.timestamp
  };
}

export function applyEventToThreadStore(threadStore: ThreadStore, event: AgentStreamEvent): ThreadState | undefined {
  if (event.type === "thread.created" && !threadStore.getThread(event.threadId)) {
    threadStore.createThread({ threadId: event.threadId, now: event.timestamp, title: event.title });
  }

  let thread = threadStore.getThread(event.threadId);
  if (!thread) {
    return undefined;
  }

  thread = threadStore.appendEvent(event.threadId, event);

  switch (event.type) {
    case "message.delta":
      return threadStore.saveThread(upsertAssistantDelta(thread, event));
    case "tool.started":
      return threadStore.saveThread(upsertToolStarted(thread, event));
    case "tool.finished":
      return threadStore.saveThread(upsertToolFinished(thread, event));
    case "plan.updated":
      return threadStore.setPlan(event.threadId, event.plan);
    case "artifact.updated":
      return threadStore.setArtifact(event.threadId, event.artifact);
    case "confirmation.required":
      return threadStore.setPendingConfirmation(event.threadId, {
        planId: event.planId,
        summary: event.summary,
        actions: event.actions
      });
    case "execution.receipt":
      return threadStore.addReceipt(event.threadId, event.receipt);
    case "run.completed": {
      const saved = threadStore.setStatus(event.threadId, event.state);
      return event.state === "DONE" ? threadStore.clearPendingConfirmation(event.threadId) : saved;
    }
    case "run.failed":
      return threadStore.saveThread({
        ...threadStore.setStatus(event.threadId, "PARTIAL_FAILURE", event.error),
        needsUserInput: {
          question: event.error.message
        }
      });
    default:
      return thread;
  }
}

export function threadToAgentRunOutput(thread: ThreadState): AgentRunOutput {
  return {
    sessionId: thread.threadId,
    state: thread.status,
    messages: thread.messages,
    plan: thread.plan,
    toolTraces: thread.toolTraces,
    needsUserInput: thread.needsUserInput,
    executionReceipts: thread.receipts,
    error: thread.error
  };
}

export function saveAgentRunOutputToThreadStore(
  threadStore: ThreadStore,
  session: AgentRunOutput,
  now = new Date().toISOString()
) {
  const existing =
    threadStore.getThread(session.sessionId) ??
    threadStore.createThread({ threadId: session.sessionId, now, title: session.plan?.title });

  const pendingConfirmation =
    session.state === "READY_FOR_CONFIRMATION" && session.plan
      ? {
          planId: session.plan.id,
          summary: session.plan.summary,
          actions: session.plan.requiredActions
        }
      : existing.pendingConfirmation;

  threadStore.saveThread({
    ...existing,
    title: session.plan?.title ?? existing.title,
    status: session.state,
    messages: [...session.messages],
    toolTraces: [...session.toolTraces],
    plan: session.plan,
    artifacts: existing.artifacts,
    pendingConfirmation,
    needsUserInput: session.needsUserInput,
    receipts: [...session.executionReceipts],
    error: session.error,
    updatedAt: now
  });

  return session;
}

export function createLocalActivityAgent(): LocalActivityAgent {
  return {
    streamTurn(input) {
      return runChatTurn({
        runId: input.runId,
        threadId: input.threadId,
        message: input.message,
        clientRunId: input.clientRunId,
        existingThread: input.existingThread,
        now: input.now,
        llmClient: input.llmClient
      });
    }
  };
}

export function createLocalActivityRuntime(options: {
  threadStore: ThreadStore;
  runManager: RunManager;
  streamBridge: StreamBridge;
  agent?: LocalActivityAgent;
}): LocalActivityRuntime {
  const { threadStore, runManager, streamBridge } = options;
  const agent = options.agent ?? createLocalActivityAgent();

  function ensureThread(input: ChatTurnInput) {
    if (input.threadId) {
      const existing = threadStore.getThread(input.threadId);
      if (existing) {
        return { thread: existing, created: false };
      }

      return {
        thread: threadStore.createThread({
          threadId: input.threadId,
          now: input.now,
          title: titleFromMessage(input.message)
        }),
        created: true
      };
    }

    return {
      thread: threadStore.createThread({
        now: input.now,
        title: titleFromMessage(input.message)
      }),
      created: true
    };
  }

  async function publish(runId: string, event: AgentStreamEvent) {
    applyEventToThreadStore(threadStore, event);
    if (event.type === "run.completed") {
      runManager.markSuccess(runId);
    }
    if (event.type === "run.failed") {
      const run = runManager.getRun(runId);
      if (run?.status !== "cancelled") {
        runManager.markFailed(runId, event.error);
      }
    }
    await streamBridge.publish(runId, event);
  }

  async function produce(input: ChatTurnInput, thread: ThreadState, run: RunRecord, created: boolean) {
    let terminalPublished = false;

    const abortError: ToolError = {
      code: "UNKNOWN",
      message: "Run cancelled by client disconnect",
      recoverable: true
    };

    const assertNotAborted = () => {
      if (run.abortController.signal.aborted) {
        throw abortError;
      }
    };

    const onAbort = () => {
      run.abortController.abort();
    };
    input.abortSignal?.addEventListener("abort", onAbort, { once: true });

    try {
      runManager.markRunning(run.runId);

      if (created) {
        await publish(run.runId, {
          type: "thread.created",
          runId: run.runId,
          threadId: thread.threadId,
          timestamp: input.now,
          title: thread.title
        });
      }

      assertNotAborted();

      const existingThread = threadStore.getThread(thread.threadId);
      for await (const event of agent.streamTurn({
        ...input,
        threadId: thread.threadId,
        runId: run.runId,
        existingThread,
        abortSignal: run.abortController.signal
      })) {
        assertNotAborted();
        await publish(run.runId, event);
        if (event.type === "run.completed" || event.type === "run.failed") {
          terminalPublished = true;
        }
      }
    } catch (error) {
      if (!terminalPublished) {
        const normalized = error === abortError ? abortError : normalizeError(error);
        if (run.abortController.signal.aborted || error === abortError) {
          runManager.markCancelled(run.runId, normalized);
        }
        await publish(run.runId, {
          type: "run.failed",
          runId: run.runId,
          threadId: thread.threadId,
          timestamp: input.now,
          error: normalized,
          retryable: normalized.recoverable
        });
      }
    } finally {
      input.abortSignal?.removeEventListener("abort", onAbort);
      await streamBridge.publishEnd(run.runId);
    }
  }

  return {
    startTurn(input) {
      const { thread, created } = ensureThread(input);

      if (input.clientRunId) {
        const existingRun = runManager.findRunByClientRunId(thread.threadId, input.clientRunId);
        if (existingRun) {
          return {
            runId: existingRun.runId,
            threadId: existingRun.threadId,
            events: streamBridge.subscribe(existingRun.runId),
            reused: true
          };
        }
      }

      const run = runManager.createRun({
        threadId: thread.threadId,
        clientRunId: input.clientRunId
      });
      threadStore.appendMessage(thread.threadId, userMessage(input.message, input.now));
      void produce(input, thread, run, created);

      return {
        runId: run.runId,
        threadId: thread.threadId,
        events: streamBridge.subscribe(run.runId),
        reused: false
      };
    },

    getThread(threadId) {
      return threadStore.getThread(threadId);
    },

    getSession(threadId) {
      const thread = threadStore.getThread(threadId);
      return thread ? threadToAgentRunOutput(thread) : undefined;
    },

    saveSession(session) {
      return saveAgentRunOutputToThreadStore(threadStore, session);
    }
  };
}
