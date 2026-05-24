import type {
  ComposePlanInput,
  DraftAssistantReplyInput,
  LLMClient,
  NativeToolCall,
  ParsedGoalHint,
  RepairPlanInput,
  ToolCallingInput,
  ToolCallingTurn,
  ToolPlanningInput,
  VerifyPlanInput
} from "@mh/core/llm";
import type {
  AgentStreamEvent,
  Plan,
  PlannedToolCall,
  PlanValidationDecision,
  RepairDecision,
  ToolPlanningDecision
} from "@mh/core/shared";
import { describe, expect, it } from "vitest";
import { runChatTurn } from "../index";

const now = "2026-05-24T12:00:00+08:00";

const familyToolCalls: PlannedToolCall[] = [
  { id: "profile", toolName: "getUserProfile", input: { userId: "xiaoming" }, reason: "获取家庭和联系人信息" },
  {
    id: "activities",
    toolName: "searchNearbyActivities",
    input: { scenario: "family", tags: ["child_friendly", "indoor"], radiusKm: 5 },
    reason: "查找附近亲子活动"
  },
  {
    id: "activity-availability",
    toolName: "checkActivityAvailability",
    input: { activityId: "kid-pottery", partySize: 3, time: "14:30" },
    reason: "确认活动名额"
  },
  {
    id: "restaurants",
    toolName: "searchRestaurants",
    input: { scenario: "family", partySize: 3, preferences: ["healthy", "light", "low_fat"], radiusKm: 5 },
    reason: "查找清淡低脂餐厅"
  },
  {
    id: "restaurant-availability",
    toolName: "checkRestaurantAvailability",
    input: { restaurantId: "qinghe-bistro", partySize: 3, time: "17:30" },
    reason: "确认晚餐桌位"
  },
  {
    id: "queue",
    toolName: "checkQueueTime",
    input: { restaurantId: "qinghe-bistro", time: "17:30" },
    reason: "确认无需久排"
  },
  {
    id: "addons",
    toolName: "searchAddOnProducts",
    input: { scenario: "family", arrivalTime: "17:25" },
    reason: "查找可选惊喜"
  }
];

const friendsToolCalls: PlannedToolCall[] = [
  { id: "profile", toolName: "getUserProfile", input: { userId: "xiaoming" }, reason: "获取联系人信息" },
  {
    id: "activities",
    toolName: "searchNearbyActivities",
    input: { scenario: "friends", tags: ["social", "photo"], radiusKm: 5 },
    reason: "查找适合四人社交的活动"
  },
  {
    id: "activity-availability",
    toolName: "checkActivityAvailability",
    input: { activityId: "city-photo-exhibit", partySize: 4, time: "14:30" },
    reason: "确认展览名额"
  },
  {
    id: "restaurants",
    toolName: "searchRestaurants",
    input: { scenario: "friends", partySize: 4, preferences: ["atmosphere", "photo"], radiusKm: 5 },
    reason: "查找有氛围的餐厅"
  },
  {
    id: "restaurant-1800",
    toolName: "checkRestaurantAvailability",
    input: { restaurantId: "neon-table", partySize: 4, time: "18:00" },
    reason: "验证首选 18:00 桌位"
  },
  {
    id: "restaurant-1830",
    toolName: "checkRestaurantAvailability",
    input: { restaurantId: "neon-table", partySize: 4, time: "18:30" },
    reason: "查找可替代时间"
  },
  {
    id: "queue",
    toolName: "checkQueueTime",
    input: { restaurantId: "neon-table", time: "18:30" },
    reason: "确认替代时间排队可接受"
  }
];

function familyPlan(): Plan {
  return {
    id: "llm-family-pottery-light-meal",
    title: "LLM：亲子陶艺 + 轻食半日",
    scenario: "family",
    summary: "14:00 出发，先做亲子陶艺，再散步缓冲，17:30 吃清淡低脂晚餐。",
    totalDurationMinutes: 290,
    estimatedBudgetCny: 620,
    confidence: 0.9,
    timeline: [
      {
        id: "family-travel",
        type: "travel",
        title: "从家出发",
        startTime: "14:00",
        endTime: "14:25",
        durationMinutes: 25,
        notes: ["近距离出行"],
        evidence: ["getUserProfile.home"]
      },
      {
        id: "family-activity",
        type: "activity",
        title: "亲子陶艺手作",
        placeName: "小手作陶艺亲子馆",
        address: "望京花园街 12 号",
        startTime: "14:30",
        endTime: "16:00",
        durationMinutes: 90,
        notes: ["适合 5 岁孩子", "工具已确认 14:30 有名额"],
        evidence: ["checkActivityAvailability.activity-availability"]
      },
      {
        id: "family-walk",
        type: "free_walk",
        title: "绿地短散步",
        placeName: "麒麟社绿地散步线",
        startTime: "16:20",
        endTime: "17:00",
        durationMinutes: 40,
        notes: ["饭前缓冲"],
        evidence: ["searchNearbyActivities.activities"]
      },
      {
        id: "family-meal",
        type: "meal",
        title: "低脂轻食晚餐",
        placeName: "青禾轻食 Bistro",
        address: "望京花园东路 18 号",
        startTime: "17:30",
        endTime: "18:30",
        durationMinutes: 60,
        notes: ["清淡低脂", "已确认 3 人桌且无需排队"],
        evidence: ["checkRestaurantAvailability.restaurant-availability", "checkQueueTime.queue"]
      }
    ],
    requiredActions: [
      {
        id: "family-book-activity",
        type: "book_activity",
        status: "pending",
        toolName: "bookActivity",
        optional: false,
        input: { activityId: "kid-pottery", partySize: 3, time: "14:30", contactName: "小明" }
      },
      {
        id: "family-reserve-meal",
        type: "reserve_restaurant",
        status: "pending",
        toolName: "reserveRestaurant",
        optional: false,
        input: { restaurantId: "qinghe-bistro", partySize: 3, time: "17:30", contactName: "小明" }
      },
      {
        id: "family-send-message",
        type: "send_message",
        status: "pending",
        toolName: "sendMessage",
        optional: false,
        input: { to: "老婆", content: "搞定了，下午 2 点出发，先做陶艺，17:30 吃轻食。" }
      }
    ],
    alternatives: [],
    risks: []
  };
}

function friendsPlanAt1800(): Plan {
  return {
    id: "llm-friends-exhibit-neon",
    title: "LLM：影像展 + 氛围晚餐",
    scenario: "friends",
    summary: "先看城市影像展，再去霓虹餐桌吃饭。",
    totalDurationMinutes: 360,
    estimatedBudgetCny: 840,
    confidence: 0.72,
    timeline: [
      {
        id: "friends-activity",
        type: "activity",
        title: "城市影像展",
        placeName: "城市影像展",
        address: "望京文化中心 3 层",
        startTime: "14:30",
        endTime: "16:10",
        durationMinutes: 100,
        notes: ["适合拍照聊天"],
        evidence: ["checkActivityAvailability.activity-availability"]
      },
      {
        id: "friends-meal",
        type: "meal",
        title: "氛围晚餐",
        placeName: "霓虹餐桌",
        address: "望京文化中心 1 层",
        startTime: "18:00",
        endTime: "19:30",
        durationMinutes: 90,
        notes: ["首选时间"],
        evidence: ["checkRestaurantAvailability.restaurant-1800"]
      }
    ],
    requiredActions: [
      {
        id: "friends-book-activity",
        type: "book_activity",
        status: "pending",
        toolName: "bookActivity",
        optional: false,
        input: { activityId: "city-photo-exhibit", partySize: 4, time: "14:30", contactName: "小明" }
      },
      {
        id: "friends-reserve-meal",
        type: "reserve_restaurant",
        status: "pending",
        toolName: "reserveRestaurant",
        optional: false,
        input: { restaurantId: "neon-table", partySize: 4, time: "18:00", contactName: "小明" }
      }
    ],
    alternatives: [],
    risks: []
  };
}

function repairedFriendsPlan(): Plan {
  return {
    ...friendsPlanAt1800(),
    id: "llm-friends-exhibit-neon-repaired",
    confidence: 0.86,
    timeline: friendsPlanAt1800().timeline.map((step) =>
      step.id === "friends-meal"
        ? {
            ...step,
            startTime: "18:30",
            endTime: "20:00",
            notes: ["18:00 无四人桌，改为已确认的 18:30", "预计排队 8 分钟"],
            evidence: ["checkRestaurantAvailability.restaurant-1830", "checkQueueTime.queue"]
          }
        : step
    ),
    requiredActions: friendsPlanAt1800().requiredActions.map((action) =>
      action.id === "friends-reserve-meal"
        ? {
            ...action,
            input: { restaurantId: "neon-table", partySize: 4, time: "18:30", contactName: "小明" }
          }
        : action
    ),
    risks: [
      {
        code: "REPAIRED_RESTAURANT_TIME",
        message: "18:00 无 4 人桌，已根据工具结果调整为 18:30。",
        severity: "info"
      }
    ]
  };
}

function toNativeToolCalls(calls: PlannedToolCall[]): NativeToolCall[] {
  return calls.map((call) => ({
    id: call.id,
    name: call.toolName,
    input: call.input,
    argumentsJson: JSON.stringify(call.input)
  }));
}

function finalTurn(plan: Plan, assistantMessage = "我查好了，可以确认后执行。"): ToolCallingTurn {
  return {
    content: JSON.stringify({
      status: "ready",
      assistantMessage,
      plan,
      reasonSummary: "Native tool-calling ReAct loop produced the plan."
    }),
    toolCalls: [],
    finishReason: "stop"
  };
}

class ScriptedReActLLMClient implements LLMClient {
  readonly provider = "deepseek";
  readonly toolInputs: ToolCallingInput[] = [];
  private cursor = 0;

  constructor(private readonly turns: ToolCallingTurn[]) {}

  async chatWithTools(input: ToolCallingInput): Promise<ToolCallingTurn> {
    this.toolInputs.push(input);
    const turn = this.turns[this.cursor];
    this.cursor += 1;

    if (!turn) {
      throw new Error("No scripted ReAct turn available");
    }

    return turn;
  }

  async parseGoal(): Promise<ParsedGoalHint> {
    throw new Error("parseGoal should not be used by the ReAct planning loop");
  }

  async draftAssistantReply(input: DraftAssistantReplyInput) {
    return input.fallback;
  }

  async planToolCalls(_input: ToolPlanningInput): Promise<ToolPlanningDecision> {
    throw new Error("planToolCalls should not be used by the ReAct planning loop");
  }

  async composePlan(_input: ComposePlanInput): Promise<Plan> {
    throw new Error("composePlan should not be used by the ReAct planning loop");
  }

  async verifyPlan(_input: VerifyPlanInput): Promise<PlanValidationDecision> {
    throw new Error("verifyPlan should not be used by the ReAct planning loop");
  }

  async repairPlan(input: RepairPlanInput): Promise<RepairDecision> {
    throw new Error(`repairPlan should not be used by the ReAct planning loop: ${input.validation.reasonSummary}`);
  }
}

class IllegalToolLLMClient extends ScriptedReActLLMClient {
  constructor() {
    super([
      {
        content: "",
        toolCalls: [
          {
            id: "bad",
            name: "deleteEverything",
            input: {},
            argumentsJson: "{}"
          }
        ],
        finishReason: "tool_calls"
      }
    ]);
  }
}

class UnsafePlanLLMClient extends ScriptedReActLLMClient {
  constructor() {
    const unsafe = familyPlan();
    unsafe.requiredActions[0] = {
      ...unsafe.requiredActions[0],
      status: "succeeded",
      receipt: {
        id: "FAKE-RECEIPT",
        type: "activity_booking",
        targetName: "伪造订单",
        status: "confirmed",
        details: {}
      }
    };

    super([
      {
        content: "",
        toolCalls: toNativeToolCalls(familyToolCalls),
        finishReason: "tool_calls"
      },
      finalTurn(unsafe)
    ]);
  }
}

async function collectEvents(input: Parameters<typeof runChatTurn>[0]) {
  const events: AgentStreamEvent[] = [];
  for await (const event of runChatTurn(input)) {
    events.push(event);
  }
  return events;
}

function planFrom(events: AgentStreamEvent[]): Plan | undefined {
  const event = events.find((item) => item.type === "plan.updated");
  return event?.type === "plan.updated" ? event.plan : undefined;
}

function terminalState(events: AgentStreamEvent[]) {
  const terminal = events.at(-1);
  return terminal?.type === "run.completed"
    ? terminal.state
    : terminal?.type === "run.failed"
      ? "PARTIAL_FAILURE"
      : undefined;
}

describe("LLM-driven agent loop", () => {
  it("uses native LLM tool calls and a final ReAct plan instead of agent mock plans", async () => {
    const llmClient = new ScriptedReActLLMClient([
      {
        content: "",
        toolCalls: toNativeToolCalls(familyToolCalls),
        finishReason: "tool_calls"
      },
      finalTurn(familyPlan(), "收到，我会查活动、餐厅和排队情况后给出一键安排。")
    ]);

    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient
    });
    const plan = planFrom(events);
    const toolEvents = events.filter((event) => event.type === "tool.finished");

    expect(terminalState(events)).toBe("READY_FOR_CONFIRMATION");
    expect(plan?.id).toBe("llm-family-pottery-light-meal");
    expect(plan?.id).not.toMatch(/family-steady|plan-family/);
    expect(toolEvents.map((event) => event.toolName)).toEqual(familyToolCalls.map((call) => call.toolName));
    expect(llmClient.toolInputs[0]?.tools.map((tool) => tool.function.name)).toContain("searchNearbyActivities");
    expect(llmClient.toolInputs[0]?.tools.map((tool) => tool.function.name)).not.toContain("reserveRestaurant");
    expect(llmClient.toolInputs[1]?.messages.some((item) => item.role === "tool")).toBe(true);
    expect(events.some((event) => event.type === "execution.receipt")).toBe(false);
  });

  it("repairs a friends plan through ReAct observations instead of hard-coded agent repair", async () => {
    const llmClient = new ScriptedReActLLMClient([
      {
        content: "",
        toolCalls: toNativeToolCalls(
          friendsToolCalls.filter((call) => call.id !== "restaurant-1830" && call.id !== "queue")
        ),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls(
          friendsToolCalls.filter((call) => call.id === "restaurant-1830" || call.id === "queue")
        ),
        finishReason: "tool_calls"
      },
      finalTurn(repairedFriendsPlan())
    ]);

    const events = await collectEvents({
      message: "今天下午我们 4 个朋友，2 男 2 女，想玩几个小时再吃饭，别太远。",
      now,
      llmClient
    });
    const plan = planFrom(events);
    const failedTool = events.find(
      (event) =>
        event.type === "tool.finished" && event.toolName === "checkRestaurantAvailability" && event.status === "failed"
    );

    expect(terminalState(events)).toBe("READY_FOR_CONFIRMATION");
    expect(failedTool).toMatchObject({ type: "tool.finished", error: { code: "NO_AVAILABILITY" } });
    expect(
      llmClient.toolInputs[1]?.messages.some((item) => item.role === "tool" && item.content.includes("NO_AVAILABILITY"))
    ).toBe(true);
    expect(plan?.id).toBe("llm-friends-exhibit-neon-repaired");
    expect(plan?.timeline.some((step) => step.type === "meal" && step.startTime === "18:30")).toBe(true);
    expect(plan?.risks.some((risk) => risk.code === "REPAIRED_RESTAURANT_TIME")).toBe(true);
  });

  it("fails the run when the LLM selects a tool outside the registry", async () => {
    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient: new IllegalToolLLMClient()
    });

    expect(terminalState(events)).toBe("PARTIAL_FAILURE");
    expect(planFrom(events)).toBeUndefined();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool.finished",
          toolName: "deleteEverything",
          status: "failed",
          error: expect.objectContaining({ code: "VALIDATION_ERROR" })
        })
      ])
    );
  });

  it("rejects unsafe LLM plans that claim execution receipts before confirmation", async () => {
    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient: new UnsafePlanLLMClient()
    });

    expect(terminalState(events)).toBe("PARTIAL_FAILURE");
    expect(planFrom(events)).toBeUndefined();
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "run.failed",
          error: expect.objectContaining({ code: "VALIDATION_ERROR" })
        })
      ])
    );
  });

  it("asks the ReAct model to repair invalid final plan JSON before failing the run", async () => {
    const llmClient = new ScriptedReActLLMClient([
      {
        content: "",
        toolCalls: toNativeToolCalls(familyToolCalls),
        finishReason: "tool_calls"
      },
      {
        content: JSON.stringify({
          status: "ready",
          assistantMessage: "先给一个结构不完整的方案。",
          plan: { id: "invalid-plan" }
        }),
        toolCalls: [],
        finishReason: "stop"
      },
      finalTurn(familyPlan(), "已修正为完整可执行方案。")
    ]);

    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient
    });
    const plan = planFrom(events);

    expect(terminalState(events)).toBe("READY_FOR_CONFIRMATION");
    expect(plan?.id).toBe("llm-family-pottery-light-meal");
    expect(
      llmClient.toolInputs
        .at(-1)
        ?.messages.some((item) => item.role === "user" && item.content.includes("FINAL_PLAN_SCHEMA_ERROR"))
    ).toBe(true);
  });

  it("streams a single chat endpoint with LLM steps, tool events, plan, and confirmation", async () => {
    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient: new ScriptedReActLLMClient([
        {
          content: "",
          toolCalls: toNativeToolCalls(familyToolCalls),
          finishReason: "tool_calls"
        },
        finalTurn(familyPlan())
      ])
    });

    expect(events.some((event) => event.type === "agent.step" && event.phase === "planning")).toBe(true);
    expect(events.some((event) => event.type === "tool.started")).toBe(true);
    expect(events.some((event) => event.type === "tool.finished")).toBe(true);
    expect(events.some((event) => event.type === "plan.updated")).toBe(true);
    expect(events.some((event) => event.type === "confirmation.required")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "run.completed", state: "READY_FOR_CONFIRMATION" });
  });

  it("skips exact duplicate tool calls and emits readable display metadata", async () => {
    const repeatedCall = familyToolCalls[1]!;
    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient: new ScriptedReActLLMClient([
        {
          content: "",
          toolCalls: toNativeToolCalls([repeatedCall, repeatedCall]),
          finishReason: "tool_calls"
        },
        finalTurn(familyPlan())
      ])
    });

    const finished = events.filter(
      (event) => event.type === "tool.finished" && event.toolName === repeatedCall.toolName
    );

    expect(finished).toHaveLength(2);
    expect(finished[0]).toMatchObject({
      type: "tool.finished",
      status: "succeeded",
      display: {
        title: "查询活动候选"
      }
    });
    expect(finished[1]).toMatchObject({
      type: "tool.finished",
      status: "skipped",
      display: {
        title: "跳过重复查询"
      }
    });
  });

  it("falls back to a partial plan instead of failing after repeated non-converging tool turns", async () => {
    const repeatedSearch = familyToolCalls[1]!;
    const loopingTurns: ToolCallingTurn[] = Array.from({ length: 8 }, () => ({
      content: "",
      toolCalls: toNativeToolCalls([repeatedSearch]),
      finishReason: "tool_calls"
    }));

    const events = await collectEvents({
      message: "今天下午想和老婆孩子出去玩几个小时，别太远。",
      now,
      llmClient: new ScriptedReActLLMClient(loopingTurns)
    });

    expect(events.some((event) => event.type === "run.failed")).toBe(false);
    expect(events.some((event) => event.type === "plan.updated")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "run.completed", state: "READY_FOR_CONFIRMATION" });
  });

  it("synthesizes a normal plan from successful traces when the model keeps calling tools", async () => {
    const turns: ToolCallingTurn[] = [
      {
        content: "",
        toolCalls: toNativeToolCalls([familyToolCalls[0]!]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "empty-activities-1",
            toolName: "searchNearbyActivities",
            input: { scenario: "family", tags: ["亲子", "户外", "室内"], radiusKm: 5 }
          },
          familyToolCalls[3]!
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "empty-activities-2",
            toolName: "searchNearbyActivities",
            input: { scenario: "family", tags: ["公园", "游乐", "儿童", "展览"], radiusKm: 5 }
          }
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "activities-wide",
            toolName: "searchNearbyActivities",
            input: { scenario: "family", radiusKm: 8 }
          }
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "kid-1500",
            toolName: "checkActivityAvailability",
            input: { activityId: "kid-pottery", partySize: 3, time: "15:00" }
          },
          {
            id: "restaurant-1800",
            toolName: "checkRestaurantAvailability",
            input: { restaurantId: "qinghe-bistro", partySize: 3, time: "18:00" }
          }
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "queue-1800",
            toolName: "checkQueueTime",
            input: { restaurantId: "qinghe-bistro", time: "18:00" }
          }
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "travel-home-kid",
            toolName: "estimateTravelTime",
            input: {
              from: { label: "小明家", lat: 39.996, lng: 116.48 },
              to: { label: "小手作陶艺亲子馆", lat: 40.002, lng: 116.484 }
            }
          }
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "repeat-wide",
            toolName: "searchNearbyActivities",
            input: { scenario: "family", radiusKm: 8 }
          }
        ]),
        finishReason: "tool_calls"
      }
    ];

    const events = await collectEvents({
      message: "111",
      now,
      llmClient: new ScriptedReActLLMClient(turns)
    });
    const plan = planFrom(events);
    const assistant = events.find((event) => event.type === "message.delta");
    const artifact = events.find((event) => event.type === "artifact.updated");

    expect(plan?.title).toBe("亲子活动方案");
    expect(plan?.summary).not.toContain("工具查询没有完全收敛");
    expect(plan?.timeline.some((step) => step.placeName === "小手作陶艺亲子馆")).toBe(true);
    expect(plan?.requiredActions[0]?.input).toMatchObject({ activityId: "kid-pottery", time: "15:00" });
    expect(assistant).toMatchObject({
      type: "message.delta",
      delta: expect.not.stringContaining("兜底")
    });
    expect(artifact).toMatchObject({
      type: "artifact.updated",
      artifact: {
        title: "亲子活动方案",
        status: "draft"
      }
    });
    expect(artifact?.type === "artifact.updated" ? artifact.artifact.content : "").toContain("小手作陶艺亲子馆");
    expect(events.at(-1)).toMatchObject({ type: "run.completed", state: "READY_FOR_CONFIRMATION" });
  });

  it("forces finalization after schema repair once enough tool facts are available", async () => {
    const lateUnneededCall: PlannedToolCall = {
      id: "late-unneeded",
      toolName: "searchRestaurants",
      input: { scenario: "family", partySize: 3, radiusKm: 8 }
    };
    const llmClient = new ScriptedReActLLMClient([
      {
        content: "",
        toolCalls: toNativeToolCalls([familyToolCalls[0]!]),
        finishReason: "tool_calls"
      },
      {
        content: "我先整理一下",
        toolCalls: [],
        finishReason: "stop"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "activities-wide",
            toolName: "searchNearbyActivities",
            input: { scenario: "family", radiusKm: 8 }
          },
          familyToolCalls[3]!
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([
          {
            id: "kid-1500",
            toolName: "checkActivityAvailability",
            input: { activityId: "kid-pottery", partySize: 3, time: "15:00" }
          },
          {
            id: "restaurant-1800",
            toolName: "checkRestaurantAvailability",
            input: { restaurantId: "qinghe-bistro", partySize: 3, time: "18:00" }
          }
        ]),
        finishReason: "tool_calls"
      },
      {
        content: "",
        toolCalls: toNativeToolCalls([lateUnneededCall]),
        finishReason: "tool_calls"
      }
    ]);

    const events = await collectEvents({
      message: "111",
      now,
      llmClient
    });
    const plan = planFrom(events);

    expect(llmClient.toolInputs).toHaveLength(4);
    expect(events.some((event) => event.type === "tool.started" && event.toolCallId === "late-unneeded")).toBe(false);
    expect(plan?.title).toBe("亲子活动方案");
    expect(plan?.summary).not.toContain("工具查询没有完全收敛");
    expect(events.some((event) => event.type === "agent.step" && event.phase === "repair")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "run.completed", state: "READY_FOR_CONFIRMATION" });
  });
});
