import { beforeEach, describe, expect, it } from "vitest";
import { resetAgentRuntimeForTests } from "../../../lib/agentRuntime";
import { getSession } from "../../../lib/sessionStore";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function readEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const event = frame
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice("event: ".length);
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);

      return {
        event,
        data: data ? JSON.parse(data) : undefined
      };
    });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = "fake";
    resetAgentRuntimeForTests();
  });

  it("rejects invalid requests before opening an SSE stream", async () => {
    const response = await POST(request({ message: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "message is required" });
  });

  it("streams planning events for a new chat thread", async () => {
    const response = await POST(
      request({
        message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
        now: "2026-05-24T12:00:00+08:00"
      })
    );
    const events = await readEvents(response);

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(events[0]?.event).toBe("thread.created");
    expect(events.some((item) => item.event === "artifact.updated")).toBe(true);
    expect(events.some((item) => item.event === "confirmation.required")).toBe(true);
    expect(events.findIndex((item) => item.event === "plan.updated")).toBeLessThan(
      events.findIndex((item) => item.event === "artifact.updated")
    );
    expect(events.findIndex((item) => item.event === "artifact.updated")).toBeLessThan(
      events.findIndex((item) => item.event === "confirmation.required")
    );
    expect(events.find((item) => item.event === "artifact.updated")?.data.artifact.content).toContain("## 时间线");
    expect(events.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "READY_FOR_CONFIRMATION" }
    });
    expect(events.find((item) => item.event === "tool.finished")?.data.display.title).toBeTruthy();
    expect(events.findIndex((item) => item.event === "run.completed" || item.event === "run.failed")).toBe(
      events.length - 1
    );
  });

  it("streams confirmed execution through the same endpoint", async () => {
    const planningResponse = await POST(
      request({
        message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
        now: "2026-05-24T12:00:00+08:00"
      })
    );
    const planningEvents = await readEvents(planningResponse);
    const threadId = planningEvents.find((item) => item.event === "thread.created")?.data.threadId;

    const confirmationResponse = await POST(
      request({
        threadId,
        message: "确认，就按这个安排",
        now: "2026-05-24T12:05:00+08:00"
      })
    );
    const confirmationEvents = await readEvents(confirmationResponse);

    expect(confirmationEvents.some((item) => item.event === "execution.receipt")).toBe(true);
    expect(confirmationEvents.find((item) => item.event === "artifact.updated")).toMatchObject({
      event: "artifact.updated",
      data: {
        artifact: {
          status: "final"
        }
      }
    });
    expect(confirmationEvents.find((item) => item.event === "artifact.updated")?.data.artifact.content).toContain(
      "## 执行回执"
    );
    expect(confirmationEvents.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "DONE" }
    });
  });

  it("does not execute confirmation-like text when the thread has no pending confirmation", async () => {
    const response = await POST(
      request({
        threadId: "thread_without_pending",
        message: "确认，就按这个安排",
        now: "2026-05-24T12:00:00+08:00"
      })
    );
    const events = await readEvents(response);

    expect(events.some((item) => item.event === "execution.receipt")).toBe(false);
    expect(events.some((item) => item.event === "confirmation.required")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "READY_FOR_CONFIRMATION" }
    });
  });

  it("treats revision turns from pending confirmation as replanning instead of execution", async () => {
    const planningResponse = await POST(
      request({
        message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
        now: "2026-05-24T12:00:00+08:00"
      })
    );
    const planningEvents = await readEvents(planningResponse);
    const threadId = planningEvents.find((item) => item.event === "thread.created")?.data.threadId;

    const revisionResponse = await POST(
      request({
        threadId,
        message: "可以，但改成晚上一点，不要现在下单",
        now: "2026-05-24T12:05:00+08:00"
      })
    );
    const revisionEvents = await readEvents(revisionResponse);

    expect(revisionEvents.some((item) => item.event === "execution.receipt")).toBe(false);
    expect(revisionEvents.some((item) => item.event === "confirmation.required")).toBe(true);
    expect(revisionEvents.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "READY_FOR_CONFIRMATION" }
    });
  });

  it("does not execute unrelated follow-up turns from pending confirmation", async () => {
    const planningResponse = await POST(
      request({
        message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
        now: "2026-05-24T12:00:00+08:00"
      })
    );
    const planningEvents = await readEvents(planningResponse);
    const threadId = planningEvents.find((item) => item.event === "thread.created")?.data.threadId;

    const followUpResponse = await POST(
      request({
        threadId,
        message: "这个地方会不会太远？",
        now: "2026-05-24T12:05:00+08:00"
      })
    );
    const followUpEvents = await readEvents(followUpResponse);

    expect(followUpEvents.some((item) => item.event === "execution.receipt")).toBe(false);
    expect(followUpEvents.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "READY_FOR_CONFIRMATION" }
    });
  });

  it("replays duplicate client run ids without duplicating persisted receipts", async () => {
    const planningResponse = await POST(
      request({
        message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
        now: "2026-05-24T12:00:00+08:00"
      })
    );
    const planningEvents = await readEvents(planningResponse);
    const threadId = planningEvents.find((item) => item.event === "thread.created")?.data.threadId;
    const confirmationBody = {
      threadId,
      message: "确认，就按这个安排",
      clientRunId: "confirm_same_client_run",
      now: "2026-05-24T12:05:00+08:00"
    };

    const firstEvents = await readEvents(await POST(request(confirmationBody)));
    const duplicateEvents = await readEvents(await POST(request(confirmationBody)));
    const receiptCount = firstEvents.filter((item) => item.event === "execution.receipt").length;
    const session = getSession(threadId);

    expect(receiptCount).toBeGreaterThanOrEqual(3);
    expect(duplicateEvents.filter((item) => item.event === "execution.receipt")).toHaveLength(receiptCount);
    expect(session?.executionReceipts).toHaveLength(receiptCount);
    expect(session?.messages.filter((message) => message.role === "user")).toHaveLength(2);
  });
});
