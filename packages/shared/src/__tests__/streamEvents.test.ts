import { describe, expect, it } from "vitest";
import { AgentStreamEventSchema } from "../index";

const base = {
  runId: "run_123",
  threadId: "thread_123",
  timestamp: "2026-05-24T12:00:00.000Z"
};

describe("AgentStreamEventSchema", () => {
  it("parses a thread creation event", () => {
    const parsed = AgentStreamEventSchema.parse({
      ...base,
      type: "thread.created",
      title: "周六家庭下午安排"
    });

    expect(parsed.type).toBe("thread.created");
    expect(parsed.threadId).toBe("thread_123");
  });

  it("parses a confirmation request with executable actions", () => {
    const parsed = AgentStreamEventSchema.parse({
      ...base,
      type: "confirmation.required",
      planId: "plan-family-steady",
      summary: "下午 2 点出发，先去亲子陶艺，再去清淡晚餐。",
      actions: [
        {
          id: "family-reserve-meal",
          type: "reserve_restaurant",
          status: "pending",
          toolName: "reserveRestaurant",
          input: { restaurantId: "qinghe-bistro", time: "17:30" },
          optional: false
        }
      ]
    });

    expect(parsed.type).toBe("confirmation.required");
    if (parsed.type !== "confirmation.required") {
      throw new Error("expected confirmation.required event");
    }
    expect(parsed.actions[0]?.toolName).toBe("reserveRestaurant");
  });

  it("rejects unsupported event types", () => {
    const parsed = AgentStreamEventSchema.safeParse({
      ...base,
      type: "plan.execute.from_frontend"
    });

    expect(parsed.success).toBe(false);
  });
});
