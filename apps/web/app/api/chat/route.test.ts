import { describe, expect, it } from "vitest";
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
    expect(events.some((item) => item.event === "confirmation.required")).toBe(true);
    expect(events.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "READY_FOR_CONFIRMATION" }
    });
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
    expect(confirmationEvents.at(-1)).toMatchObject({
      event: "run.completed",
      data: { state: "DONE" }
    });
  });
});
