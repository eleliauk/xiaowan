import type { AgentStreamEvent, Plan } from "@mh/core/shared";
import { describe, expect, it } from "vitest";
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
      {
        ...base,
        type: "artifact.updated",
        artifact: {
          id: "artifact_plan-family-steady",
          kind: "markdown",
          title: plan.title,
          content: "# 轻松亲子半日\n\n## 时间线\n\n| 时间 | 事项 |\n| --- | --- |",
          status: "draft",
          sourcePlanId: plan.id,
          updatedAt: base.timestamp
        },
        display: {
          title: plan.title,
          summary: "已生成可确认的 Markdown 方案文档。",
          artifactRef: "document",
          severity: "success"
        }
      },
      { ...base, type: "confirmation.required", planId: plan.id, summary: plan.summary, actions: plan.requiredActions },
      { ...base, type: "run.completed", state: "READY_FOR_CONFIRMATION" }
    ];

    const next = events.reduce(applyClientEvent, thread);

    expect(next.title).toBe("周六家庭下午安排");
    expect(next.messages).toEqual([
      expect.objectContaining({ id: "msg_1", role: "assistant", content: "我先看下附近选择。" })
    ]);
    expect(next.plan?.id).toBe("plan-family-steady");
    expect(next.artifacts[0]?.content).toContain("## 时间线");
    expect(next.artifactPanel).toMatchObject({ open: true, selected: "document" });
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
      inputSummary: '{"restaurantId":"qinghe-bistro"}'
    });
    const withFinishedTool = applyClientEvent(withTool, {
      ...base,
      type: "tool.finished",
      toolCallId: "tool_1",
      toolName: "reserveRestaurant",
      status: "succeeded",
      outputSummary: '{"id":"receipt_1"}'
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

  it("prefers display metadata for steps and opens the matching artifact panel", () => {
    const thread = createEmptyThread("thread_123");
    const withTool = applyClientEvent(thread, {
      ...base,
      type: "tool.finished",
      toolCallId: "tool_profile",
      toolName: "getUserProfile",
      status: "succeeded",
      outputSummary: '{"home":{"address":"望京 SOHO 附近"},"contacts":{"spouse":"老婆"}}',
      display: {
        title: "读取家庭画像",
        summary: "家庭 3 人，偏好清淡少排队。",
        severity: "success",
        items: [
          { label: "成员", value: "小明、老婆、孩子" },
          { label: "偏好", value: "亲子、清淡、少排队" }
        ]
      }
    });
    const withPlan = applyClientEvent(withTool, {
      ...base,
      type: "plan.updated",
      plan,
      display: {
        title: "方案已生成",
        summary: plan.summary,
        artifactRef: "plan",
        severity: "success"
      }
    });

    expect(withPlan.steps[0]).toMatchObject({
      title: "读取家庭画像",
      detail: "家庭 3 人，偏好清淡少排队。"
    });
    expect(withPlan.steps[0]?.outputSummary).toBeUndefined();
    expect(withPlan.artifactPanel).toMatchObject({
      open: true,
      selected: "plan"
    });
  });

  it("keeps the markdown document selected when confirmation arrives", () => {
    const withArtifact = applyClientEvent(createEmptyThread("thread_123"), {
      ...base,
      type: "artifact.updated",
      artifact: {
        id: "artifact_plan-family-steady",
        kind: "markdown",
        title: plan.title,
        content: "# 轻松亲子半日\n\n## 待确认动作",
        status: "draft",
        sourcePlanId: plan.id,
        updatedAt: base.timestamp
      },
      display: {
        title: plan.title,
        artifactRef: "document",
        severity: "success"
      }
    });

    const withConfirmation = applyClientEvent(withArtifact, {
      ...base,
      type: "confirmation.required",
      planId: plan.id,
      summary: plan.summary,
      actions: plan.requiredActions
    });

    expect(withConfirmation.confirmation?.actions).toHaveLength(1);
    expect(withConfirmation.artifactPanel).toMatchObject({
      open: true,
      selected: "document"
    });
  });

  it("clears pending confirmation when the markdown document becomes final", () => {
    const withConfirmation = applyClientEvent(createEmptyThread("thread_123"), {
      ...base,
      type: "confirmation.required",
      planId: plan.id,
      summary: plan.summary,
      actions: plan.requiredActions
    });

    const withFinalArtifact = applyClientEvent(withConfirmation, {
      ...base,
      type: "artifact.updated",
      artifact: {
        id: "artifact_plan-family-steady",
        kind: "markdown",
        title: plan.title,
        content: "# 轻松亲子半日\n\n## 执行回执",
        status: "final",
        sourcePlanId: plan.id,
        updatedAt: base.timestamp
      },
      display: {
        title: plan.title,
        artifactRef: "document",
        severity: "success"
      }
    });

    expect(withFinalArtifact.confirmation).toBeUndefined();
    expect(withFinalArtifact.artifactPanel).toMatchObject({
      open: true,
      selected: "document"
    });
  });
});
