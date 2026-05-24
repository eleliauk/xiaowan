import { describe, expect, it } from "vitest";
import type { AgentStreamEvent, Plan } from "@mh/shared";
import { applyClientEvent, createEmptyThread } from "./chatState";

const base = {
  runId: "run_123",
  threadId: "thread_123",
  timestamp: "2026-05-24T12:00:00.000Z"
};

const plan: Plan = {
  id: "plan-family-steady",
  title: "轻松亲子半日",
  scenario: "family",
  summary: "下午 2 点出发，先亲子活动，再清淡晚餐。",
  totalDurationMinutes: 290,
  estimatedBudgetCny: 599,
  confidence: 0.9,
  timeline: [],
  requiredActions: [
    {
      id: "reserve",
      type: "reserve_restaurant",
      status: "pending",
      toolName: "reserveRestaurant",
      input: { restaurantId: "qinghe-bistro" },
      optional: false
    }
  ],
  alternatives: [],
  risks: []
};

describe("chat client event state", () => {
  it("folds stream events into a chat thread", () => {
    const thread = createEmptyThread("thread_123");
    const events: AgentStreamEvent[] = [
      { ...base, type: "thread.created", title: "周六家庭下午安排" },
      { ...base, type: "message.delta", messageId: "msg_1", role: "assistant", delta: "我先看下附近选择。" },
      { ...base, type: "message.completed", messageId: "msg_1", role: "assistant" },
      { ...base, type: "plan.updated", plan },
      { ...base, type: "confirmation.required", planId: plan.id, summary: plan.summary, actions: plan.requiredActions },
      { ...base, type: "run.completed", state: "READY_FOR_CONFIRMATION" }
    ];

    const next = events.reduce(applyClientEvent, thread);

    expect(next.title).toBe("周六家庭下午安排");
    expect(next.messages).toEqual([
      expect.objectContaining({ id: "msg_1", role: "assistant", content: "我先看下附近选择。" })
    ]);
    expect(next.plan?.id).toBe("plan-family-steady");
    expect(next.confirmation?.actions).toHaveLength(1);
    expect(next.status).toBe("READY_FOR_CONFIRMATION");
  });

  it("updates tool and receipt state without losing prior messages", () => {
    const withMessage = applyClientEvent(createEmptyThread("thread_123"), {
      ...base,
      type: "message.delta",
      messageId: "msg_1",
      role: "assistant",
      delta: "安排中"
    });

    const withTool = applyClientEvent(withMessage, {
      ...base,
      type: "tool.started",
      toolCallId: "tool_1",
      toolName: "reserveRestaurant",
      inputSummary: "{\"restaurantId\":\"qinghe-bistro\"}"
    });
    const withFinishedTool = applyClientEvent(withTool, {
      ...base,
      type: "tool.finished",
      toolCallId: "tool_1",
      toolName: "reserveRestaurant",
      status: "succeeded",
      outputSummary: "{\"id\":\"receipt_1\"}"
    });
    const withReceipt = applyClientEvent(withFinishedTool, {
      ...base,
      type: "execution.receipt",
      receipt: {
        id: "receipt_1",
        type: "restaurant_reservation",
        targetName: "青禾轻食 Bistro",
        time: "17:30",
        status: "confirmed",
        details: {}
      }
    });

    expect(withReceipt.messages[0]?.content).toBe("安排中");
    expect(withReceipt.steps[0]).toMatchObject({ id: "tool_1", status: "succeeded" });
    expect(withReceipt.receipts[0]?.targetName).toBe("青禾轻食 Bistro");
  });
});
