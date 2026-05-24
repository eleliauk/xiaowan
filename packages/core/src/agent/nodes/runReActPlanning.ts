import { createLLMClient, type NativeChatMessage, type NativeToolCall } from "@mh/core/llm";
import { type Plan, PlanSchema, type ToolCallTrace } from "@mh/core/shared";
import { createDefaultToolRegistry, toOpenAIToolDefinition } from "@mh/core/tools";
import { z } from "zod";
import { stableStringify, toolFinishedDisplay, toolStartedDisplay } from "../display";
import { createId, message, tracedToolCall } from "../helpers";
import type { AgentRuntimeState } from "../state";

const MAX_REACT_LOOPS = 8;

const executionTools = new Set(["bookActivity", "reserveRestaurant", "scheduleDelivery", "sendMessage"]);

const ReActFinalResponseSchema = z.object({
  status: z.enum(["ready", "need_clarification", "failed"]),
  assistantMessage: z.string().optional(),
  clarificationQuestion: z.string().optional(),
  plan: PlanSchema.optional(),
  reasonSummary: z.string().optional()
});

const allowedExecutionTools = new Set(["bookActivity", "reserveRestaurant", "scheduleDelivery", "sendMessage"]);

function unsafePlanReason(plan: Plan) {
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) {
    return parsed.error.message;
  }

  const unsafeAction = parsed.data.requiredActions.find(
    (action) => action.status !== "pending" || Boolean(action.receipt) || !allowedExecutionTools.has(action.toolName)
  );

  if (unsafeAction) {
    return `Unsafe action ${unsafeAction.id}: actions must be pending, receipt-free, and use execution tools only.`;
  }

  return undefined;
}

function compact(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "string" && item.length > 900) {
      return `${item.slice(0, 897)}...`;
    }

    return item;
  });
}

function extractJsonObject(text: string) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? cleaned).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("Model final answer did not contain a JSON object");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function parseFinalResponse(content: string) {
  return ReActFinalResponseSchema.parse(extractJsonObject(content));
}

function validationMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.length > 1600 ? `${raw.slice(0, 1597)}...` : raw;
}

function buildSystemPrompt(now: string) {
  return [
    "你是美团本地短时活动规划与执行 Agent，使用 ReAct 范式完成规划。",
    "你可以通过 native tool calls 查询事实；每次拿到 observation 后再决定下一步工具调用或输出最终方案。",
    "当前阶段只做规划，不能下单、不能预约、不能发送消息；这些动作必须作为 pending requiredActions 等用户确认后再执行。",
    "规划目标：下午 4-6 小时，本地近距离，包含去哪玩、玩完去哪吃、饭前饭后是否有额外活动，并能一键确认执行。",
    "家庭场景要照顾 5 岁孩子、妻子减肥、清淡低脂和少排队；朋友场景要照顾 4 人、2 男 2 女、社交氛围、拍照和聚餐。",
    "遇到餐厅/活动不可用、排队过长、配送不可用，要继续查询备选时间或备选地点，不要把失败 observation 当成功。",
    "最终不要输出 Markdown，只输出 JSON：",
    '{ "status": "ready|need_clarification|failed", "assistantMessage": "...", "clarificationQuestion": "...", "plan": Plan, "reasonSummary": "..." }',
    "Plan 必须包含 id,title,scenario,summary,totalDurationMinutes,estimatedBudgetCny,confidence,timeline,requiredActions,alternatives,risks。",
    "timeline type 只能是 travel,activity,meal,delivery,free_walk；requiredActions type 只能是 reserve_restaurant,book_activity,schedule_delivery,send_message。",
    "requiredActions.status 必须全部是 pending，不能包含 receipt、订单号、支付状态或 succeeded。",
    "requiredActions.toolName 只能是 bookActivity、reserveRestaurant、scheduleDelivery、sendMessage。",
    `当前时间：${now}`
  ].join("\n");
}

function toolObservation(trace: ToolCallTrace) {
  if (trace.status === "skipped") {
    return {
      ok: true,
      skipped: true,
      toolName: trace.toolName,
      input: trace.input,
      reason: "Duplicate or excessive tool call skipped by runtime guardrail"
    };
  }

  return trace.status === "succeeded"
    ? {
        ok: true,
        toolName: trace.toolName,
        input: trace.input,
        output: trace.output
      }
    : {
        ok: false,
        toolName: trace.toolName,
        input: trace.input,
        error: trace.error
      };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function valueText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function firstOutputItem(traces: ToolCallTrace[], toolName: string) {
  const trace = traces.find(
    (item) => item.toolName === toolName && item.status === "succeeded" && asArray(item.output).length > 0
  );
  return asArray(trace?.output)[0];
}

function scenarioFromMessage(userMessage: string): "family" | "friends" {
  return /朋友|好友|同学|同事|四|4/.test(userMessage) && !/老婆|妻子|孩子|亲子|娃/.test(userMessage)
    ? "friends"
    : "family";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function outputItems(traces: ToolCallTrace[], toolName: string) {
  return traces
    .filter((trace) => trace.toolName === toolName && trace.status === "succeeded")
    .flatMap((trace) => asArray(trace.output))
    .map(asRecord);
}

function findRecordById(records: Record<string, unknown>[], id?: string) {
  return id ? records.find((record) => valueText(record.id) === id) : undefined;
}

function successfulTrace(traces: ToolCallTrace[], toolName: string) {
  return traces.find((trace) => trace.toolName === toolName && trace.status === "succeeded");
}

function successfulTraceByOutput(
  traces: ToolCallTrace[],
  toolName: string,
  predicate: (output: Record<string, unknown>, input: Record<string, unknown>) => boolean
) {
  return traces.find((trace) => {
    if (trace.toolName !== toolName || trace.status !== "succeeded") {
      return false;
    }

    return predicate(asRecord(trace.output), asRecord(trace.input));
  });
}

function clockToMinutes(time?: string) {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return undefined;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToClock(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number) {
  const base = clockToMinutes(time);
  return base === undefined ? time : minutesToClock(base + minutes);
}

function diffMinutes(start: string, end: string) {
  const startMinutes = clockToMinutes(start);
  const endMinutes = clockToMinutes(end);
  if (startMinutes === undefined || endMinutes === undefined) {
    return undefined;
  }

  return Math.max(0, endMinutes - startMinutes);
}

function buildTraceSynthesizedPlan(state: AgentRuntimeState, traces: ToolCallTrace[]): Plan | undefined {
  const scenario = scenarioFromMessage(state.userMessage);
  const activities = outputItems(traces, "searchNearbyActivities");
  const restaurants = outputItems(traces, "searchRestaurants");
  const activityAvailability = successfulTraceByOutput(
    traces,
    "checkActivityAvailability",
    (output) => output.available === true
  );
  const restaurantAvailability = successfulTraceByOutput(
    traces,
    "checkRestaurantAvailability",
    (output) => output.available === true
  );
  const hasTravelOrAvailability = traces.some(
    (trace) =>
      trace.status === "succeeded" &&
      ["estimateTravelTime", "checkActivityAvailability", "checkRestaurantAvailability", "checkQueueTime"].includes(
        trace.toolName
      )
  );

  if (activities.length === 0 || restaurants.length === 0 || !hasTravelOrAvailability) {
    return undefined;
  }

  const activityAvailabilityInput = asRecord(activityAvailability?.input);
  const activityAvailabilityOutput = asRecord(activityAvailability?.output);
  const activityId =
    valueText(activityAvailabilityOutput.activityId) ??
    valueText(activityAvailabilityInput.activityId) ??
    valueText(activities[0]?.id);
  const activity = findRecordById(activities, activityId) ?? activities[0] ?? {};
  const activityName = valueText(activity.name) ?? valueText(activity.title) ?? "本地活动";
  const activityTime = valueText(activityAvailabilityInput.time) ?? "14:30";
  const partySize =
    numberValue(activityAvailabilityInput.partySize) ??
    numberValue(asRecord(restaurantAvailability?.input).partySize) ??
    (scenario === "family" ? 3 : 4);
  const activityDuration = numberValue(activity.durationMinutes) ?? (scenario === "family" ? 90 : 100);
  const activityEndTime = addMinutes(activityTime, activityDuration);

  const restaurantAvailabilityInput = asRecord(restaurantAvailability?.input);
  const restaurantAvailabilityOutput = asRecord(restaurantAvailability?.output);
  const restaurantId =
    valueText(restaurantAvailabilityOutput.restaurantId) ??
    valueText(restaurantAvailabilityInput.restaurantId) ??
    valueText(restaurants[0]?.id);
  const restaurant = findRecordById(restaurants, restaurantId) ?? restaurants[0] ?? {};
  const restaurantName = valueText(restaurant.name) ?? "晚餐餐厅";
  const mealTime =
    valueText(restaurantAvailabilityOutput.time) ?? valueText(restaurantAvailabilityInput.time) ?? "17:30";
  const mealEndTime = addMinutes(mealTime, 60);

  const travelTrace = successfulTrace(traces, "estimateTravelTime");
  const travelOutput = asRecord(travelTrace?.output);
  const travelMinutes = numberValue(travelOutput.minutes) ?? 20;
  const travelStartTime = addMinutes(activityTime, -travelMinutes);
  const queueTrace = successfulTraceByOutput(
    traces,
    "checkQueueTime",
    (output) =>
      valueText(output.restaurantId) === restaurantId &&
      (!valueText(output.time) || valueText(output.time) === mealTime)
  );
  const queueMinutes = numberValue(asRecord(queueTrace?.output).queueMinutes);
  const activityBudget =
    numberValue(activityAvailabilityOutput.priceCny) ?? (numberValue(activity.priceCny) ?? 0) * partySize;
  const mealBudget = (numberValue(restaurant.averagePriceCny) ?? 0) * partySize;
  const totalBudget = Math.max(0, Math.round(activityBudget + mealBudget));
  const totalDuration = diffMinutes(travelStartTime, mealEndTime) ?? 300;
  const recoveredFailures = traces.filter((trace) => trace.status === "failed" && trace.error?.recoverable).slice(0, 2);
  const hasCheckedActivity = Boolean(activityAvailability);
  const hasCheckedRestaurant = Boolean(restaurantAvailability);

  return {
    id: `trace-${scenario}-plan`,
    title: scenario === "family" ? "亲子活动方案" : "朋友活动方案",
    scenario,
    summary: "已基于查到的活动候选、餐厅桌位和路程信息整理出可确认方案。",
    totalDurationMinutes: totalDuration,
    estimatedBudgetCny: totalBudget || (scenario === "family" ? 620 : 840),
    confidence: hasCheckedActivity && hasCheckedRestaurant ? 0.84 : 0.72,
    timeline: [
      {
        id: `${scenario}-trace-travel`,
        type: "travel",
        title: "从当前位置出发",
        placeName: "路上",
        startTime: travelStartTime,
        endTime: activityTime,
        durationMinutes: travelMinutes,
        notes: travelTrace
          ? [`预计 ${travelMinutes} 分钟，${valueText(travelOutput.distanceKm) ?? "-"} km。`]
          : ["保持近距离出行。"],
        evidence: ["getUserProfile", "estimateTravelTime"]
      },
      {
        id: `${scenario}-trace-activity`,
        type: valueText(activity.type) === "free_walk" ? "free_walk" : "activity",
        title: activityName,
        placeName: activityName,
        address: valueText(activity.address),
        startTime: activityTime,
        endTime: activityEndTime,
        durationMinutes: activityDuration,
        notes: [
          hasCheckedActivity ? `已确认 ${activityTime} 有名额。` : "来自已查到的活动候选，确认前保留可用性提示。",
          ...(scenario === "family" ? ["适合亲子同行，节奏较轻。"] : ["适合朋友同行和社交聊天。"])
        ],
        evidence: ["searchNearbyActivities", ...(hasCheckedActivity ? ["checkActivityAvailability"] : [])]
      },
      {
        id: `${scenario}-trace-meal`,
        type: "meal",
        title: scenario === "family" ? "清淡低脂晚餐" : "轻松聚餐",
        placeName: restaurantName,
        address: valueText(restaurant.address),
        startTime: mealTime,
        endTime: mealEndTime,
        durationMinutes: 60,
        notes: [
          hasCheckedRestaurant ? `已确认 ${mealTime} 可订 ${partySize} 人桌。` : "来自已查到的餐厅候选。",
          queueMinutes === undefined ? "排队情况可在确认前复核。" : `预计排队 ${queueMinutes} 分钟。`
        ],
        evidence: ["searchRestaurants", ...(hasCheckedRestaurant ? ["checkRestaurantAvailability"] : [])]
      }
    ],
    requiredActions: [
      {
        id: `${scenario}-trace-book-activity`,
        type: "book_activity",
        status: "pending",
        toolName: "bookActivity",
        optional: false,
        input: {
          activityId,
          partySize,
          time: activityTime,
          contactName: "小明"
        }
      },
      {
        id: `${scenario}-trace-reserve-meal`,
        type: "reserve_restaurant",
        status: "pending",
        toolName: "reserveRestaurant",
        optional: !hasCheckedRestaurant,
        input: {
          restaurantId,
          partySize,
          time: mealTime,
          contactName: "小明"
        }
      },
      {
        id: `${scenario}-trace-send-message`,
        type: "send_message",
        status: "pending",
        toolName: "sendMessage",
        optional: false,
        input: {
          to: scenario === "family" ? "老婆" : "小张",
          content:
            scenario === "family"
              ? `我查好了，${activityTime} 去${activityName}，${mealTime} 去${restaurantName}，确认后我来预约。`
              : `我查好了，${activityTime} 去${activityName}，${mealTime} 去${restaurantName}，确认后我来预约。`
        }
      }
    ],
    alternatives: [],
    risks: [
      ...recoveredFailures.map((trace) => ({
        code: `RECOVERED_${trace.toolName}`,
        message: `${trace.toolName}：${trace.error?.message ?? "已自动避开不可用选项。"}`,
        severity: "info" as const
      })),
      ...(!hasCheckedActivity
        ? [
            {
              code: "ACTIVITY_AVAILABILITY_UNCHECKED",
              message: "活动名额尚未完整确认，执行前会再走预约工具校验。",
              severity: "warning" as const
            }
          ]
        : []),
      ...(!hasCheckedRestaurant
        ? [
            {
              code: "RESTAURANT_AVAILABILITY_UNCHECKED",
              message: "餐厅桌位尚未完整确认，执行前会再走订位工具校验。",
              severity: "warning" as const
            }
          ]
        : [])
    ]
  };
}

async function synthesizePlanFromTraces(state: AgentRuntimeState, traces: ToolCallTrace[]) {
  const synthesizedPlan = buildTraceSynthesizedPlan(state, traces);
  if (!synthesizedPlan) {
    return undefined;
  }

  await emitAgentStep(state, "verification", "生成方案", "succeeded", synthesizedPlan.summary);
  return {
    toolTraces: traces,
    selectedPlan: synthesizedPlan,
    messages: [
      message("user", state.userMessage, state.now),
      message("assistant", "我已基于查到的活动、餐厅和路程信息整理出可确认方案。", state.now)
    ]
  } satisfies Partial<AgentRuntimeState>;
}

function buildFallbackPlan(state: AgentRuntimeState, traces: ToolCallTrace[]): Plan | undefined {
  const scenario = scenarioFromMessage(state.userMessage);
  const activity = asRecord(firstOutputItem(traces, "searchNearbyActivities"));
  const restaurant = asRecord(firstOutputItem(traces, "searchRestaurants"));
  const activityId = valueText(activity.id) ?? (scenario === "family" ? "kid-pottery" : "city-photo-exhibit");
  const activityName = valueText(activity.name) ?? (scenario === "family" ? "亲子手作活动" : "城市影像展");
  const activityAddress = valueText(activity.address);
  const restaurantId = valueText(restaurant.id);
  const restaurantName = valueText(restaurant.name);
  const hasActivityFacts = Boolean(activityName);

  if (!hasActivityFacts && traces.filter((trace) => trace.status === "succeeded").length === 0) {
    return undefined;
  }

  const mealStep = restaurantName
    ? [
        {
          id: `${scenario}-fallback-meal`,
          type: "meal" as const,
          title: scenario === "family" ? "清淡低脂晚餐" : "轻松聚餐",
          placeName: restaurantName,
          address: valueText(restaurant.address),
          startTime: "17:30",
          endTime: "18:30",
          durationMinutes: 60,
          notes: ["基于已查到的餐厅候选安排，确认前仍会保留风险提示。"],
          evidence: ["searchRestaurants"]
        }
      ]
    : [
        {
          id: `${scenario}-fallback-walk`,
          type: "free_walk" as const,
          title: scenario === "family" ? "饭前短散步" : "活动后自由聊天",
          startTime: "16:20",
          endTime: "17:20",
          durationMinutes: 60,
          notes: ["餐厅事实不足，先给出可执行活动主线。"],
          evidence: ["searchNearbyActivities"]
        }
      ];

  const actions = [
    {
      id: `${scenario}-fallback-book-activity`,
      type: "book_activity" as const,
      status: "pending" as const,
      toolName: "bookActivity",
      optional: false,
      input: {
        activityId,
        partySize: scenario === "family" ? 3 : 4,
        time: "14:30",
        contactName: "小明"
      }
    },
    ...(restaurantId
      ? [
          {
            id: `${scenario}-fallback-reserve-meal`,
            type: "reserve_restaurant" as const,
            status: "pending" as const,
            toolName: "reserveRestaurant",
            optional: true,
            input: {
              restaurantId,
              partySize: scenario === "family" ? 3 : 4,
              time: "17:30",
              contactName: "小明"
            }
          }
        ]
      : []),
    {
      id: `${scenario}-fallback-send-message`,
      type: "send_message" as const,
      status: "pending" as const,
      toolName: "sendMessage",
      optional: false,
      input: {
        to: scenario === "family" ? "老婆" : "小张",
        content:
          scenario === "family"
            ? "我先安排一个近距离亲子活动方案，确认后再执行预约。"
            : "我先安排一个四人下午活动方案，确认后再执行预约。"
      }
    }
  ];

  return {
    id: `fallback-${scenario}-partial-plan`,
    title: scenario === "family" ? "亲子活动兜底方案" : "朋友活动兜底方案",
    scenario,
    summary: "工具查询没有完全收敛，我先基于已确认的候选事实整理出可确认的兜底方案。",
    totalDurationMinutes: restaurantName ? 300 : 240,
    estimatedBudgetCny: scenario === "family" ? 520 : 760,
    confidence: restaurantName ? 0.72 : 0.58,
    timeline: [
      {
        id: `${scenario}-fallback-travel`,
        type: "travel",
        title: "从当前位置出发",
        startTime: "14:00",
        endTime: "14:25",
        durationMinutes: 25,
        notes: ["保持近距离出行。"],
        evidence: ["getUserProfile", "searchNearbyActivities"]
      },
      {
        id: `${scenario}-fallback-activity`,
        type: "activity",
        title: activityName,
        placeName: activityName,
        address: activityAddress,
        startTime: "14:30",
        endTime: "16:00",
        durationMinutes: 90,
        notes: ["来自已查到的活动候选。"],
        evidence: ["searchNearbyActivities"]
      },
      ...mealStep
    ],
    requiredActions: actions,
    alternatives: [],
    risks: [
      {
        code: "PARTIAL_FACTS_FALLBACK",
        message: "模型多轮工具调用未收敛，已用已有候选事实生成兜底方案；确认前请注意部分可用性仍需执行工具校验。",
        severity: "warning"
      }
    ]
  };
}

function failedToolTrace(call: NativeToolCall, messageText: string): ToolCallTrace {
  const now = new Date().toISOString();
  return {
    id: call.id || createId("tool"),
    toolName: call.name,
    input: call.input,
    status: "failed",
    startedAt: now,
    endedAt: now,
    error: {
      code: "VALIDATION_ERROR",
      message: messageText,
      recoverable: false
    }
  };
}

function fallbackAssistantText(plan?: Plan, content?: string) {
  if (content?.trim()) {
    return content.trim().slice(0, 240);
  }

  return plan?.summary ?? "我已经完成了本地活动规划，请确认后执行预约和发送消息。";
}

async function emitToolStarted(state: AgentRuntimeState, call: NativeToolCall) {
  if (!state.eventSink || !state.streamContext) {
    return;
  }

  await state.eventSink({
    ...state.streamContext,
    type: "tool.started",
    toolCallId: call.id || createId("tool"),
    toolName: call.name,
    inputSummary: compact(call.input),
    display: toolStartedDisplay(call.name, call.input)
  });
}

async function emitToolFinished(state: AgentRuntimeState, trace: ToolCallTrace) {
  if (!state.eventSink || !state.streamContext) {
    return;
  }

  await state.eventSink({
    ...state.streamContext,
    type: "tool.finished",
    toolCallId: trace.id,
    toolName: trace.toolName,
    status: trace.status === "skipped" ? "skipped" : trace.status === "succeeded" ? "succeeded" : "failed",
    outputSummary: trace.output === undefined ? undefined : compact(trace.output),
    error: trace.error,
    display: toolFinishedDisplay(trace)
  });
}

async function emitAgentStep(
  state: AgentRuntimeState,
  phase: "tooling" | "verification" | "repair",
  title: string,
  status: "running" | "succeeded" | "failed" | "skipped",
  detail?: string
) {
  if (!state.eventSink || !state.streamContext) {
    return;
  }

  await state.eventSink({
    ...state.streamContext,
    type: "agent.step",
    phase,
    title,
    status,
    detail,
    display: {
      title,
      summary: detail,
      severity: status === "failed" ? "error" : status === "succeeded" ? "success" : "info"
    }
  });
}

export async function runReActPlanning(state: AgentRuntimeState): Promise<Partial<AgentRuntimeState>> {
  const client = state.llmClient ?? createLLMClient();
  const registry = createDefaultToolRegistry();
  const planningTools = registry
    .list()
    .filter((tool) => !executionTools.has(tool.name))
    .map(toOpenAIToolDefinition);
  const knownPlanningToolNames = new Set(planningTools.map((tool) => tool.function.name));
  const seenFingerprints = new Set<string>();
  const toolCounts = new Map<string, number>();
  const messages: NativeChatMessage[] = [
    { role: "system", content: buildSystemPrompt(state.now) },
    { role: "user", content: state.userMessage }
  ];
  let traces = state.toolTraces;
  let schemaRepairCount = 0;

  try {
    for (let loop = 0; loop < MAX_REACT_LOOPS; loop += 1) {
      const turn = await client.chatWithTools({ messages, tools: planningTools });

      if (turn.toolCalls.length === 0) {
        await emitAgentStep(state, "verification", "校验方案结构", "running", "检查模型输出是否可确认执行");
        let final: z.infer<typeof ReActFinalResponseSchema>;
        try {
          final = parseFinalResponse(turn.content);
        } catch (error) {
          schemaRepairCount += 1;
          await emitAgentStep(state, "repair", "修复方案结构", "running", validationMessage(error));
          messages.push({
            role: "assistant",
            content: turn.content,
            reasoningContent: turn.reasoningContent
          });
          messages.push({
            role: "user",
            content: [
              "FINAL_PLAN_SCHEMA_ERROR:",
              validationMessage(error),
              "请基于已有工具 observation 修正最终 JSON，只输出符合要求的 JSON。",
              "特别注意 timeline 每项必须有 id,type,title,startTime,endTime,durationMinutes,notes,evidence；notes 必须是字符串数组。",
              "requiredActions 每项必须有 id,type,status,toolName,optional,input，且 status 必须是 pending。"
            ].join("\n")
          });
          continue;
        }

        const assistantText = final.assistantMessage ?? fallbackAssistantText(final.plan, turn.content);

        if (final.status === "need_clarification") {
          return {
            toolTraces: traces,
            needsUserInput: {
              question: final.clarificationQuestion ?? assistantText
            },
            messages: [message("user", state.userMessage, state.now), message("assistant", assistantText, state.now)]
          };
        }

        if (final.status !== "ready" || !final.plan) {
          await emitAgentStep(state, "verification", "校验方案结构", "failed", final.reasonSummary);
          return {
            toolTraces: traces,
            messages: [message("user", state.userMessage, state.now), message("assistant", assistantText, state.now)],
            error: {
              code: "UNKNOWN",
              message: final.reasonSummary ?? "ReAct model did not produce an executable plan",
              recoverable: false
            }
          };
        }

        const unsafeReason = unsafePlanReason(final.plan);
        if (unsafeReason) {
          await emitAgentStep(state, "verification", "校验方案结构", "failed", unsafeReason);
          return {
            toolTraces: traces,
            selectedPlan: undefined,
            messages: [message("user", state.userMessage, state.now), message("assistant", assistantText, state.now)],
            error: {
              code: "VALIDATION_ERROR",
              message: unsafeReason,
              recoverable: false
            }
          };
        }

        await emitAgentStep(state, "verification", "校验方案结构", "succeeded", final.reasonSummary);
        return {
          toolTraces: traces,
          selectedPlan: final.plan,
          messages: [message("user", state.userMessage, state.now), message("assistant", assistantText, state.now)]
        };
      }

      messages.push({
        role: "assistant",
        content: turn.content,
        toolCalls: turn.toolCalls,
        reasoningContent: turn.reasoningContent
      });

      await emitAgentStep(state, "tooling", "调用规划工具", "running", `本轮 ${turn.toolCalls.length} 个工具调用`);
      for (const call of turn.toolCalls) {
        const toolCall = call.id ? call : { ...call, id: createId("tool") };
        if (!knownPlanningToolNames.has(toolCall.name)) {
          const failedTrace = failedToolTrace(toolCall, `LLM selected unknown planning tool: ${toolCall.name}`);
          await emitToolFinished(state, failedTrace);
          return {
            toolTraces: [...traces, failedTrace],
            messages: [
              message("user", state.userMessage, state.now),
              message("assistant", "模型选择了未注册工具，规划已停止。", state.now)
            ],
            error: failedTrace.error
          };
        }

        const fingerprint = `${toolCall.name}:${stableStringify(toolCall.input)}`;
        const count = toolCounts.get(toolCall.name) ?? 0;
        if (seenFingerprints.has(fingerprint) || count >= 4) {
          const now = new Date().toISOString();
          const skippedTrace: ToolCallTrace = {
            id: toolCall.id,
            toolName: toolCall.name,
            input: toolCall.input,
            output: {
              skipped: true,
              reason: seenFingerprints.has(fingerprint) ? "duplicate_tool_call" : "tool_call_limit"
            },
            status: "skipped",
            startedAt: now,
            endedAt: now
          };
          traces = [...traces, skippedTrace];
          await emitToolFinished(state, skippedTrace);
          messages.push({
            role: "tool",
            toolCallId: skippedTrace.id,
            name: skippedTrace.toolName,
            content: compact(toolObservation(skippedTrace))
          });
          continue;
        }

        seenFingerprints.add(fingerprint);
        toolCounts.set(toolCall.name, count + 1);
        await emitToolStarted(state, toolCall);
        const result = await tracedToolCall(toolCall.name, toolCall.input, traces, toolCall.id);
        traces = result.toolTraces;
        const trace = traces.at(-1)!;
        await emitToolFinished(state, trace);

        messages.push({
          role: "tool",
          toolCallId: trace.id,
          name: trace.toolName,
          content: compact(toolObservation(trace))
        });

        if (trace.error && !trace.error.recoverable) {
          return {
            toolTraces: traces,
            messages: [
              message("user", state.userMessage, state.now),
              message("assistant", "工具参数或执行失败，暂时无法继续规划。", state.now)
            ],
            error: trace.error
          };
        }
      }
      await emitAgentStep(state, "tooling", "调用规划工具", "succeeded", `已累计 ${traces.length} 个工具结果`);

      if (schemaRepairCount > 0 || loop >= 2) {
        const synthesized = await synthesizePlanFromTraces(state, traces);
        if (synthesized) {
          return synthesized;
        }
      }
    }

    const synthesized = await synthesizePlanFromTraces(state, traces);
    if (synthesized) {
      return synthesized;
    }

    const fallbackPlan = buildFallbackPlan(state, traces);
    if (fallbackPlan) {
      await emitAgentStep(state, "repair", "生成兜底方案", "succeeded", fallbackPlan.summary);
      return {
        toolTraces: traces,
        selectedPlan: fallbackPlan,
        messages: [
          message("user", state.userMessage, state.now),
          message("assistant", "工具多轮查询没有完全收敛，我先基于已查到的候选整理了一个可确认的兜底方案。", state.now)
        ]
      };
    }

    return {
      toolTraces: traces,
      messages: [
        message("user", state.userMessage, state.now),
        message("assistant", "我连续查询了多轮仍未收敛到可执行方案，暂时停止。", state.now)
      ],
      error: {
        code: "UNKNOWN",
        message: "ReAct loop reached the maximum number of tool-calling turns",
        recoverable: false
      }
    };
  } catch (error) {
    return {
      toolTraces: traces,
      messages: [
        message("user", state.userMessage, state.now),
        message("assistant", "模型规划过程中出错，暂时无法继续。", state.now)
      ],
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "ReAct planning failed",
        recoverable: false
      }
    };
  }
}
