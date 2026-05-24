import { describe, expect, it } from "vitest";
import { executeActions } from "../nodes/executeActions";
import type { AgentRuntimeState } from "../state";

const now = "2026-05-24T12:00:00+08:00";

describe("executeActions", () => {
  it("skips already succeeded actions with receipts when execution resumes", async () => {
    const receipt = {
      id: "receipt_existing",
      type: "activity_booking" as const,
      targetName: "亲子陶艺",
      status: "confirmed" as const,
      details: {}
    };
    const state: AgentRuntimeState = {
      sessionId: "thread_1",
      userMessage: "确认",
      now,
      selectedPlan: {
        id: "plan_1",
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
            notes: [],
            evidence: []
          }
        ],
        requiredActions: [
          {
            id: "book",
            type: "book_activity",
            status: "succeeded",
            toolName: "unknownExecutionTool",
            input: { activityId: "kid-pottery" },
            optional: false,
            receipt
          }
        ],
        alternatives: [],
        risks: []
      },
      messages: [],
      toolTraces: [],
      executionReceipts: []
    };

    const updates = await executeActions(state);

    expect(updates.toolTraces).toEqual([]);
    expect(updates.executionReceipts).toEqual([receipt]);
    expect(updates.selectedPlan?.requiredActions[0]).toMatchObject({
      status: "succeeded",
      receipt
    });
  });
});
