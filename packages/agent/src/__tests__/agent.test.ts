import { describe, expect, it } from "vitest";
import { executePlan, runPlanning } from "../index";

const now = "2026-05-24T12:00:00+08:00";

process.env.LLM_PROVIDER = "fake";

describe("activity planning agent", () => {
  it("plans a family afternoon without executing actions before confirmation", async () => {
    const result = await runPlanning({
      userMessage: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
      now
    });

    expect(result.state).toBe("READY_FOR_CONFIRMATION");
    expect(result.plan?.scenario).toBe("family");
    expect(result.plan?.timeline.length).toBeGreaterThanOrEqual(4);
    expect(result.plan?.requiredActions.every((action) => action.status === "pending")).toBe(true);
    expect(result.executionReceipts ?? []).toHaveLength(0);
    expect(result.toolTraces.length).toBeGreaterThanOrEqual(4);
  });

  it("repairs the friends plan when the first restaurant has no table at 18:00", async () => {
    const result = await runPlanning({
      userMessage: "今天下午我们 4 个朋友，2 男 2 女，想出去玩几个小时，吃饭也一起安排，别太远。",
      now
    });

    const failedTrace = result.toolTraces.find(
      (trace) => trace.toolName === "checkRestaurantAvailability" && trace.status === "failed"
    );

    expect(result.state).toBe("READY_FOR_CONFIRMATION");
    expect(result.plan?.scenario).toBe("friends");
    expect(failedTrace?.error?.code).toBe("NO_AVAILABILITY");
    expect(result.plan?.risks.some((risk) => risk.code === "REPAIRED_RESTAURANT_TIME")).toBe(true);
    expect(result.plan?.timeline.some((step) => step.type === "meal" && step.startTime === "18:30")).toBe(true);
  });

  it("executes confirmed plan actions and returns receipts", async () => {
    const planned = await runPlanning({
      userMessage: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
      now
    });

    const executed = await executePlan({
      sessionId: planned.sessionId,
      plan: planned.plan!,
      now
    });

    expect(executed.state).toBe("DONE");
    expect(executed.executionReceipts.length).toBeGreaterThanOrEqual(3);
    expect(executed.plan?.requiredActions.every((action) => action.status === "succeeded")).toBe(true);
  });
});
