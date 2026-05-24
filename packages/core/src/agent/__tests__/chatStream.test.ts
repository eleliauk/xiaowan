import type { AgentStreamEvent, Plan } from "@mh/core/shared";
import { describe, expect, it } from "vitest";
import { runChatTurn } from "../index";
import type { ThreadState } from "../runtime";

const now = "2026-05-24T12:00:00+08:00";

process.env.LLM_PROVIDER = "fake";

async function collect(input: Parameters<typeof runChatTurn>[0]) {
  const events: AgentStreamEvent[] = [];
  for await (const event of runChatTurn(input)) {
    events.push(event);
  }
  return events;
}

function planFrom(events: AgentStreamEvent[]): Plan {
  const event = events.find((item) => item.type === "plan.updated");
  if (event?.type !== "plan.updated") {
    throw new Error("Expected plan.updated event");
  }
  return event.plan;
}

function eventIndex(events: AgentStreamEvent[], type: AgentStreamEvent["type"]) {
  return events.findIndex((event) => event.type === type);
}

function threadWithPlan(threadId: string, plan: Plan): ThreadState {
  return {
    threadId,
    title: plan.title,
    status: "READY_FOR_CONFIRMATION",
    messages: [],
    events: [],
    toolTraces: [],
    artifacts: [],
    plan,
    pendingConfirmation: {
      planId: plan.id,
      summary: plan.summary,
      actions: plan.requiredActions
    },
    receipts: [],
    createdAt: now,
    updatedAt: now
  };
}

describe("runChatTurn", () => {
  it("streams a new family planning turn to confirmation without execution receipts", async () => {
    const events = await collect({
      message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
      now
    });

    expect(events[0]?.type).toBe("thread.created");
    expect(events.some((event) => event.type === "plan.updated")).toBe(true);
    expect(events.some((event) => event.type === "artifact.updated")).toBe(true);
    expect(events.some((event) => event.type === "confirmation.required")).toBe(true);
    expect(events.some((event) => event.type === "execution.receipt")).toBe(false);
    expect(eventIndex(events, "plan.updated")).toBeLessThan(eventIndex(events, "artifact.updated"));
    expect(eventIndex(events, "artifact.updated")).toBeLessThan(eventIndex(events, "confirmation.required"));
    const artifact = events.find((event) => event.type === "artifact.updated");
    expect(artifact).toMatchObject({
      type: "artifact.updated",
      artifact: {
        kind: "markdown",
        status: "draft",
        content: expect.stringContaining("## 时间线")
      },
      display: {
        artifactRef: "document"
      }
    });
    expect(events.at(-1)).toMatchObject({
      type: "run.completed",
      state: "READY_FOR_CONFIRMATION"
    });
  });

  it("streams confirmed execution receipts through the same chat runner", async () => {
    const planningEvents = await collect({
      message: "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
      now
    });
    const threadId = planningEvents[0]?.threadId ?? "thread_family";
    const plan = planFrom(planningEvents);

    const events = await collect({
      threadId,
      message: "确认，就按这个安排",
      existingThread: threadWithPlan(threadId, plan),
      now
    });

    const receipts = events.filter((event) => event.type === "execution.receipt");
    const finalArtifact = events.find((event) => event.type === "artifact.updated");

    expect(receipts.length).toBeGreaterThanOrEqual(3);
    expect(finalArtifact).toMatchObject({
      type: "artifact.updated",
      artifact: {
        status: "final",
        content: expect.stringContaining("## 执行回执")
      }
    });
    expect(eventIndex(events, "execution.receipt")).toBeLessThan(eventIndex(events, "artifact.updated"));
    expect(events.at(-1)).toMatchObject({
      type: "run.completed",
      state: "DONE"
    });
  });

  it("streams the friends restaurant repair path as a failed tool event and repaired plan", async () => {
    const events = await collect({
      message: "今天下午我们 4 个朋友，2 男 2 女，想出去玩几个小时，吃饭也一起安排，别太远。",
      now
    });

    const failedTool = events.find(
      (event) =>
        event.type === "tool.finished" && event.toolName === "checkRestaurantAvailability" && event.status === "failed"
    );
    const planUpdate = events.find((event) => event.type === "plan.updated");

    expect(failedTool).toMatchObject({
      type: "tool.finished",
      error: { code: "NO_AVAILABILITY" }
    });
    expect(planUpdate).toMatchObject({
      type: "plan.updated",
      plan: {
        scenario: "friends",
        risks: expect.arrayContaining([expect.objectContaining({ code: "REPAIRED_RESTAURANT_TIME" })])
      }
    });
  });
});
