import type { AgentStreamEvent, Plan } from "@mh/shared";
import { describe, expect, it } from "vitest";
import {
  createInMemoryRunManager,
  createInMemoryStreamBridge,
  createInMemoryThreadStore,
  createLocalActivityRuntime
} from "../runtime";

const now = "2026-05-24T12:00:00+08:00";

function plan(): Plan {
  return {
    id: "plan_family",
    title: "亲子下午",
    scenario: "family",
    summary: "先活动再吃饭",
    totalDurationMinutes: 180,
    estimatedBudgetCny: 300,
    confidence: 0.9,
    timeline: [
      {
        id: "activity",
        type: "activity",
        title: "亲子陶艺",
        startTime: "14:30",
        endTime: "16:00",
        durationMinutes: 90,
        notes: ["已确认名额"],
        evidence: []
      }
    ],
    requiredActions: [
      {
        id: "book",
        type: "book_activity",
        status: "pending",
        toolName: "bookActivity",
        input: { activityId: "kid-pottery" },
        optional: false
      }
    ],
    alternatives: [],
    risks: []
  };
}

async function collect(events: AsyncIterable<AgentStreamEvent>) {
  const collected: AgentStreamEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe("runtime services", () => {
  it("stores thread state and pending confirmation behind a thread store", async () => {
    const store = createInMemoryThreadStore();
    const thread = store.createThread({ now, title: "家庭下午安排" });

    store.appendMessage(thread.threadId, {
      id: "msg_user",
      role: "user",
      content: "确认，就按这个安排",
      createdAt: now
    });

    store.setPendingConfirmation(thread.threadId, {
      planId: "plan_family",
      summary: "下午亲子活动和晚餐",
      actions: []
    });

    const saved = store.getThread(thread.threadId);

    expect(saved?.messages).toHaveLength(1);
    expect(saved?.status).toBe("READY_FOR_CONFIRMATION");
    expect(saved?.pendingConfirmation?.planId).toBe("plan_family");
  });

  it("tracks run lifecycle and reuses duplicate client run ids", async () => {
    const runs = createInMemoryRunManager({ now: () => now });

    const first = runs.createRun({
      threadId: "thread_1",
      clientRunId: "client_run_1"
    });
    const duplicate = runs.createRun({
      threadId: "thread_1",
      clientRunId: "client_run_1"
    });

    expect(duplicate.runId).toBe(first.runId);

    runs.markRunning(first.runId);
    runs.markFailed(first.runId, {
      code: "UNKNOWN",
      message: "boom",
      recoverable: true
    });

    expect(runs.getRun(first.runId)).toMatchObject({
      status: "failed",
      error: { message: "boom" }
    });
  });

  it("publishes retained stream events in order and closes after terminal end", async () => {
    const bridge = createInMemoryStreamBridge();

    await bridge.publish("run_1", {
      type: "agent.step",
      runId: "run_1",
      threadId: "thread_1",
      timestamp: now,
      phase: "planning",
      title: "规划",
      status: "running"
    });
    await bridge.publish("run_1", {
      type: "run.completed",
      runId: "run_1",
      threadId: "thread_1",
      timestamp: now,
      state: "READY_FOR_CONFIRMATION"
    });
    await bridge.publishEnd("run_1");

    const events = [];
    for await (const event of bridge.subscribe("run_1")) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(["agent.step", "run.completed"]);
  });

  it("starts a chat run and persists pending confirmation through the thread store", async () => {
    const threadStore = createInMemoryThreadStore();
    const streamBridge = createInMemoryStreamBridge();
    const runManager = createInMemoryRunManager({ now: () => now });
    const candidatePlan = plan();
    const runtime = createLocalActivityRuntime({
      threadStore,
      streamBridge,
      runManager,
      agent: {
        async *streamTurn(input) {
          yield {
            type: "plan.updated",
            runId: input.runId,
            threadId: input.threadId,
            timestamp: input.now,
            plan: candidatePlan
          };
          yield {
            type: "confirmation.required",
            runId: input.runId,
            threadId: input.threadId,
            timestamp: input.now,
            planId: candidatePlan.id,
            summary: candidatePlan.summary,
            actions: candidatePlan.requiredActions
          };
          yield {
            type: "run.completed",
            runId: input.runId,
            threadId: input.threadId,
            timestamp: input.now,
            state: "READY_FOR_CONFIRMATION"
          };
        }
      }
    });

    const started = runtime.startTurn({
      message: "今天下午带孩子出去玩",
      now,
      clientRunId: "client_run_plan"
    });
    const events = await collect(started.events);
    const thread = threadStore.getThread(started.threadId);

    expect(events[0]).toMatchObject({ type: "thread.created", threadId: started.threadId });
    expect(events.map((event) => event.type)).toEqual([
      "thread.created",
      "plan.updated",
      "confirmation.required",
      "run.completed"
    ]);
    expect(thread?.status).toBe("READY_FOR_CONFIRMATION");
    expect(thread?.plan?.id).toBe(candidatePlan.id);
    expect(thread?.pendingConfirmation).toMatchObject({
      planId: candidatePlan.id,
      summary: candidatePlan.summary
    });
  });

  it("reuses an existing run for duplicate client run ids", async () => {
    const threadStore = createInMemoryThreadStore();
    const streamBridge = createInMemoryStreamBridge();
    const runManager = createInMemoryRunManager({ now: () => now });
    let startedCount = 0;
    const runtime = createLocalActivityRuntime({
      threadStore,
      streamBridge,
      runManager,
      agent: {
        async *streamTurn(input) {
          startedCount += 1;
          yield {
            type: "run.completed",
            runId: input.runId,
            threadId: input.threadId,
            timestamp: input.now,
            state: "WAITING_FOR_USER"
          };
        }
      }
    });

    const first = runtime.startTurn({
      threadId: "thread_duplicate",
      message: "先建一个 run",
      now,
      clientRunId: "same_client_run"
    });
    await collect(first.events);

    const duplicate = runtime.startTurn({
      threadId: "thread_duplicate",
      message: "重复提交",
      now,
      clientRunId: "same_client_run"
    });
    await collect(duplicate.events);

    expect(duplicate.runId).toBe(first.runId);
    expect(startedCount).toBe(1);
    expect(threadStore.getThread("thread_duplicate")?.messages).toHaveLength(1);
  });

  it("emits a retryable failure event when a planning run is cancelled before confirmation", async () => {
    const threadStore = createInMemoryThreadStore();
    const streamBridge = createInMemoryStreamBridge();
    const runManager = createInMemoryRunManager({ now: () => now });
    const externalAbort = new AbortController();
    const runtime = createLocalActivityRuntime({
      threadStore,
      streamBridge,
      runManager,
      agent: {
        async *streamTurn(input) {
          yield {
            type: "agent.step",
            runId: input.runId,
            threadId: input.threadId,
            timestamp: input.now,
            phase: "planning",
            title: "规划中",
            status: "running"
          };
          await new Promise<void>((resolve) =>
            input.abortSignal?.addEventListener("abort", () => resolve(), { once: true })
          );
        }
      }
    });

    const started = runtime.startTurn({
      message: "今天下午带孩子出去玩",
      now,
      abortSignal: externalAbort.signal
    });
    const iterator = started.events[Symbol.asyncIterator]();
    const first = await iterator.next();

    externalAbort.abort();

    const rest: AgentStreamEvent[] = [];
    for await (const event of { [Symbol.asyncIterator]: () => iterator }) {
      rest.push(event);
    }

    expect(first.value).toMatchObject({ type: "thread.created" });
    expect(rest.at(-1)).toMatchObject({
      type: "run.failed",
      retryable: true,
      error: { message: "Run cancelled by client disconnect" }
    });
  });
});
