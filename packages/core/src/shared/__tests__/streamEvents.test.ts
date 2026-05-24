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

  it("parses display metadata and skipped tool events", () => {
    const parsed = AgentStreamEventSchema.parse({
      ...base,
      type: "tool.finished",
      toolCallId: "tool_repeat",
      toolName: "searchNearbyActivities",
      status: "skipped",
      outputSummary: "skipped duplicate call",
      display: {
        title: "跳过重复查询",
        summary: "已查询过相同条件的附近活动。",
        severity: "info",
        artifactRef: "diagnostics",
        items: [{ label: "工具", value: "searchNearbyActivities", status: "skipped" }]
      }
    });

    expect(parsed).toMatchObject({
      type: "tool.finished",
      status: "skipped",
      display: {
        title: "跳过重复查询",
        summary: "已查询过相同条件的附近活动。"
      }
    });
  });

  it("parses markdown artifact update events with document display metadata", () => {
    const parsed = AgentStreamEventSchema.parse({
      ...base,
      type: "artifact.updated",
      artifact: {
        id: "artifact_plan-family-steady",
        kind: "markdown",
        title: "轻松亲子半日",
        content: "# 轻松亲子半日\n\n## 时间线\n\n| 时间 | 事项 |\n| --- | --- |",
        status: "draft",
        sourcePlanId: "plan-family-steady",
        updatedAt: base.timestamp
      },
      display: {
        title: "轻松亲子半日",
        summary: "已生成可确认的 Markdown 方案文档。",
        severity: "success",
        artifactRef: "document"
      }
    });

    expect(parsed).toMatchObject({
      type: "artifact.updated",
      artifact: {
        kind: "markdown",
        status: "draft"
      },
      display: {
        artifactRef: "document"
      }
    });
  });

  it("rejects unsupported event types", () => {
    const parsed = AgentStreamEventSchema.safeParse({
      ...base,
      type: "plan.execute.from_frontend"
    });

    expect(parsed.success).toBe(false);
  });
});
