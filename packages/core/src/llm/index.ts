import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import {
  type Plan,
  type PlannedToolCall,
  PlanSchema,
  type PlanValidationDecision,
  PlanValidationDecisionSchema,
  type RepairDecision,
  RepairDecisionSchema,
  type ToolCallTrace,
  type ToolPlanningDecision,
  ToolPlanningDecisionSchema,
  type UserGoal
} from "@mh/core/shared";
import OpenAI from "openai";
import { z } from "zod";

export const LLMProviderSchema = z.enum(["auto", "fake", "minimax", "deepseek"]);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export type ResolvedLLMProvider = "fake" | "minimax" | "deepseek";

const DurationHintSchema = z.object({
  min: z.number(),
  max: z.number()
});

const StringArraySchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value
      .split(/[，,、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}, z.array(z.string()).default([]));

export const ParsedGoalHintSchema = z.object({
  provider: z.enum(["fake", "minimax", "deepseek"]).optional(),
  scenario: z.enum(["family", "friends", "unknown"]),
  childAge: z.number().int().positive().optional(),
  partySize: z.number().int().positive().optional(),
  startWindow: z.enum(["afternoon", "evening", "unknown"]).default("unknown"),
  durationHours: DurationHintSchema.optional(),
  preferences: StringArraySchema,
  constraints: StringArraySchema,
  dietaryNotes: StringArraySchema,
  clarificationQuestion: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5)
});
export type ParsedGoalHint = z.infer<typeof ParsedGoalHintSchema>;

export type ParseGoalInput = {
  message: string;
  now?: string;
};

export type DraftAssistantReplyInput = {
  userMessage: string;
  scenario: ParsedGoalHint["scenario"];
  fallback: string;
  planSummary?: string;
  clarificationQuestion?: string;
};

export type ToolDefinitionForPrompt = {
  name: string;
  description: string;
};

export type ToolPlanningInput = {
  goal: UserGoal;
  toolTraces: ToolCallTrace[];
  availableTools: ToolDefinitionForPrompt[];
  now?: string;
};

export type ComposePlanInput = {
  goal: UserGoal;
  toolTraces: ToolCallTrace[];
  now?: string;
};

export type VerifyPlanInput = {
  goal: UserGoal;
  plan: Plan;
  toolTraces: ToolCallTrace[];
  now?: string;
};

export type RepairPlanInput = {
  goal: UserGoal;
  plan: Plan;
  validation: PlanValidationDecision;
  toolTraces: ToolCallTrace[];
  now?: string;
};

export type LLMClient = {
  readonly provider: ResolvedLLMProvider;
  chatWithTools(input: ToolCallingInput): Promise<ToolCallingTurn>;
  parseGoal(input: ParseGoalInput | string): Promise<ParsedGoalHint>;
  planToolCalls(input: ToolPlanningInput): Promise<ToolPlanningDecision>;
  composePlan(input: ComposePlanInput): Promise<Plan>;
  verifyPlan(input: VerifyPlanInput): Promise<PlanValidationDecision>;
  repairPlan(input: RepairPlanInput): Promise<RepairDecision>;
  draftAssistantReply(input: DraftAssistantReplyInput): Promise<string>;
};

export type FakeLLMConfig = {
  requestedProvider: LLMProvider;
  provider: "fake";
};

export type MiniMaxLLMConfig = {
  requestedProvider: LLMProvider;
  provider: "minimax";
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  maxTokens: number;
};

export type DeepSeekLLMConfig = {
  requestedProvider: LLMProvider;
  provider: "deepseek";
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  maxTokens: number;
  thinkingType: "enabled" | "disabled";
  reasoningEffort: "high" | "max";
};

export type LLMConfig = FakeLLMConfig | MiniMaxLLMConfig | DeepSeekLLMConfig;

export type ChatModelInvoker = {
  invoke(input: string): Promise<{ content: unknown }>;
};

export type NativeToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type NativeToolCall = {
  id: string;
  name: string;
  input: unknown;
  argumentsJson: string;
};

export type NativeChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: NativeToolCall[]; reasoningContent?: string }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ToolCallingInput = {
  messages: NativeChatMessage[];
  tools: NativeToolDefinition[];
};

export type ToolCallingTurn = {
  content: string;
  toolCalls: NativeToolCall[];
  finishReason?: string;
  reasoningContent?: string;
};

export type NativeToolChatRequest = {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools: NativeToolDefinition[];
  tool_choice: "auto";
  thinking?: { type: "enabled" | "disabled" };
  reasoning_effort?: "high" | "max";
  stream: false;
  max_tokens: number;
  temperature: number;
};

export type DeepSeekChatRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  thinking: { type: "enabled" | "disabled" };
  reasoning_effort: "high" | "max";
  stream: false;
  max_tokens: number;
  temperature: number;
  response_format?: { type: "json_object" };
};

export type DeepSeekChatInvoker = {
  create(
    input: DeepSeekChatRequest | NativeToolChatRequest
  ): Promise<{ content: unknown; toolCalls?: NativeToolCall[]; finishReason?: string; reasoningContent?: string }>;
};

type NativeToolTurnInvoker = DeepSeekChatInvoker & {
  createToolTurn(
    input: ToolCallingInput
  ): Promise<{ content: unknown; toolCalls?: NativeToolCall[]; finishReason?: string; reasoningContent?: string }>;
};

type EnvLike = Record<string, string | undefined>;

const DEFAULT_MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M2.7";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_MAX_TOKENS = 4096;

export class LLMConfigurationError extends Error {
  readonly code = "LLM_CONFIG_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "LLMConfigurationError";
  }
}

export class LLMOutputParseError extends Error {
  readonly code = "LLM_OUTPUT_PARSE_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "LLMOutputParseError";
  }
}

function normalizeInput(input: ParseGoalInput | string): ParseGoalInput {
  return typeof input === "string" ? { message: input } : input;
}

function parseProvider(value: string | undefined): LLMProvider {
  return LLMProviderSchema.safeParse(value).success ? (value as LLMProvider) : "auto";
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function requiredApiKey(provider: LLMProvider, value: string | undefined, envName: string) {
  const apiKey = value?.trim();
  if (apiKey) {
    return apiKey;
  }

  throw new LLMConfigurationError(`${envName} is required when LLM_PROVIDER=${provider}`);
}

function parseEnvFile(content: string): EnvLike {
  const values: EnvLike = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, equalsIndex).trim();
    let value = normalized.slice(equalsIndex + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function localEnvSearchDirs(startDir: string) {
  const dirs: string[] = [];
  let current = startDir;

  while (true) {
    dirs.push(current);
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      break;
    }

    const parent = dirname(current);
    if (parent === current || parsePath(current).root === current) {
      break;
    }
    current = parent;
  }

  return dirs.reverse();
}

function loadLocalEnv(env: EnvLike = process.env): EnvLike {
  const merged: EnvLike = {};

  for (const dir of localEnvSearchDirs(process.cwd())) {
    for (const file of [".env", ".env.local"]) {
      const filePath = join(dir, file);
      if (existsSync(filePath)) {
        Object.assign(merged, parseEnvFile(readFileSync(filePath, "utf8")));
      }
    }
  }

  return {
    ...merged,
    ...env
  };
}

function normalizeThinking(value: string | undefined): "enabled" | "disabled" {
  return value === "disabled" ? "disabled" : "enabled";
}

function normalizeReasoningEffort(value: string | undefined): "high" | "max" {
  return value === "max" || value === "xhigh" ? "max" : "high";
}

function deepSeekApiKey(env: EnvLike) {
  const direct = env.DEEPSEEK_API_KEY?.trim();
  if (direct) {
    return direct;
  }

  const legacyKey = env.MINIMAX_API_KEY?.trim();
  const legacyBaseUrl = env.MINIMAX_BASE_URL?.trim();
  if (legacyKey && legacyBaseUrl?.includes("deepseek")) {
    return legacyKey;
  }

  return undefined;
}

export function loadLLMConfig(env?: EnvLike): LLMConfig {
  const sourceEnv = env ?? loadLocalEnv();
  const requestedProvider = parseProvider(sourceEnv.LLM_PROVIDER);
  const hasDeepSeekCredentials = Boolean(deepSeekApiKey(sourceEnv));

  if (requestedProvider === "fake") {
    return {
      requestedProvider,
      provider: "fake"
    };
  }

  if (requestedProvider === "deepseek" || (requestedProvider === "auto" && hasDeepSeekCredentials)) {
    return {
      requestedProvider,
      provider: "deepseek",
      apiKey: requiredApiKey(
        requestedProvider === "auto" ? "deepseek" : requestedProvider,
        deepSeekApiKey(sourceEnv),
        "DEEPSEEK_API_KEY"
      ),
      baseUrl: sourceEnv.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL,
      model: sourceEnv.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
      timeoutMs: parseInteger(sourceEnv.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
      maxRetries: parseInteger(sourceEnv.LLM_MAX_RETRIES, DEFAULT_MAX_RETRIES),
      maxTokens: parseInteger(sourceEnv.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS),
      thinkingType: normalizeThinking(sourceEnv.DEEPSEEK_THINKING),
      reasoningEffort: normalizeReasoningEffort(sourceEnv.DEEPSEEK_REASONING_EFFORT)
    };
  }

  const apiKey = sourceEnv.MINIMAX_API_KEY?.trim();

  if (requestedProvider === "minimax" || apiKey) {
    const providerForError = requestedProvider === "auto" ? "minimax" : requestedProvider;
    return {
      requestedProvider,
      provider: "minimax",
      apiKey: requiredApiKey(providerForError, sourceEnv.MINIMAX_API_KEY, "MINIMAX_API_KEY"),
      baseUrl: sourceEnv.MINIMAX_BASE_URL?.trim() || DEFAULT_MINIMAX_BASE_URL,
      model: sourceEnv.MINIMAX_MODEL?.trim() || DEFAULT_MINIMAX_MODEL,
      timeoutMs: parseInteger(sourceEnv.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
      maxRetries: parseInteger(sourceEnv.LLM_MAX_RETRIES, DEFAULT_MAX_RETRIES),
      maxTokens: parseInteger(sourceEnv.LLM_MAX_TOKENS, DEFAULT_MAX_TOKENS)
    };
  }

  return {
    requestedProvider,
    provider: "fake"
  };
}

export function deterministicParseGoalHint(input: ParseGoalInput | string): ParsedGoalHint {
  const { message } = normalizeInput(input);
  const isFamily = ["老婆", "太太", "妻子", "孩子", "小朋友", "娃", "亲子"].some((keyword) =>
    message.includes(keyword)
  );
  const isFriends =
    ["朋友", "好友", "同学", "同事", "4", "四"].some((keyword) => message.includes(keyword)) && !isFamily;
  const scenario = isFamily ? "family" : isFriends ? "friends" : "unknown";

  return ParsedGoalHintSchema.parse({
    provider: "fake",
    scenario,
    childAge: scenario === "family" ? 5 : undefined,
    partySize: scenario === "friends" ? 4 : undefined,
    startWindow: "afternoon",
    durationHours: { min: 4, max: 6 },
    preferences:
      scenario === "family"
        ? ["child_friendly", "healthy", "light", "low_fat", "low_queue"]
        : scenario === "friends"
          ? ["friends", "social", "atmosphere", "photo", "walkable"]
          : [],
    constraints:
      scenario === "family"
        ? ["near_home", "kid_age_5", "wife_losing_weight", "avoid_long_queue"]
        : scenario === "friends"
          ? ["near_home", "party_size_4", "2_men_2_women", "meal_required"]
          : [],
    clarificationQuestion: scenario === "unknown" ? "这次是和家人还是朋友一起出门？" : undefined,
    confidence: scenario === "unknown" ? 0.2 : 0.8
  });
}

function fakeFamilyToolCalls(): PlannedToolCall[] {
  return [
    { id: "profile", toolName: "getUserProfile", input: { userId: "xiaoming" }, reason: "获取用户画像" },
    {
      id: "activities",
      toolName: "searchNearbyActivities",
      input: { scenario: "family", tags: ["child_friendly", "indoor"], radiusKm: 5 },
      reason: "查找亲子活动"
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
      reason: "查找轻食餐厅"
    },
    {
      id: "restaurant-availability",
      toolName: "checkRestaurantAvailability",
      input: { restaurantId: "qinghe-bistro", partySize: 3, time: "17:30" },
      reason: "确认桌位"
    },
    {
      id: "queue",
      toolName: "checkQueueTime",
      input: { restaurantId: "qinghe-bistro", time: "17:30" },
      reason: "确认排队时长"
    },
    {
      id: "addons",
      toolName: "searchAddOnProducts",
      input: { scenario: "family", arrivalTime: "17:25" },
      reason: "查找可选配送"
    }
  ];
}

function fakeFriendsToolCalls(): PlannedToolCall[] {
  return [
    { id: "profile", toolName: "getUserProfile", input: { userId: "xiaoming" }, reason: "获取用户画像" },
    {
      id: "activities",
      toolName: "searchNearbyActivities",
      input: { scenario: "friends", tags: ["social", "photo"], radiusKm: 5 },
      reason: "查找四人活动"
    },
    {
      id: "activity-availability",
      toolName: "checkActivityAvailability",
      input: { activityId: "city-photo-exhibit", partySize: 4, time: "14:30" },
      reason: "确认活动名额"
    },
    {
      id: "restaurants",
      toolName: "searchRestaurants",
      input: { scenario: "friends", partySize: 4, preferences: ["atmosphere", "photo"], radiusKm: 5 },
      reason: "查找氛围餐厅"
    },
    {
      id: "restaurant-1800",
      toolName: "checkRestaurantAvailability",
      input: { restaurantId: "neon-table", partySize: 4, time: "18:00" },
      reason: "确认首选时间"
    },
    {
      id: "restaurant-1830",
      toolName: "checkRestaurantAvailability",
      input: { restaurantId: "neon-table", partySize: 4, time: "18:30" },
      reason: "确认备选时间"
    },
    {
      id: "queue",
      toolName: "checkQueueTime",
      input: { restaurantId: "neon-table", time: "18:30" },
      reason: "确认排队时长"
    },
    {
      id: "addons",
      toolName: "searchAddOnProducts",
      input: { scenario: "friends", arrivalTime: "18:20" },
      reason: "查找可选配送"
    }
  ];
}

function fakeFamilyPlan(): Plan {
  return {
    id: "fake-family-pottery-light-meal",
    title: "亲子陶艺 + 轻食半日",
    scenario: "family",
    summary: "下午 2 点出发，先做亲子陶艺，再散步缓冲，17:30 吃清淡低脂晚餐。",
    totalDurationMinutes: 290,
    estimatedBudgetCny: 620,
    confidence: 0.86,
    timeline: [
      {
        id: "family-travel",
        type: "travel",
        title: "从家出发",
        startTime: "14:00",
        endTime: "14:25",
        durationMinutes: 25,
        notes: ["控制在近距离"],
        evidence: ["getUserProfile.profile"]
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
        notes: ["清淡低脂", "已确认 3 人桌"],
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

function fakeFriendsPlan(time = "18:00"): Plan {
  const isRepaired = time === "18:30";
  return {
    id: isRepaired ? "fake-friends-exhibit-neon-repaired" : "fake-friends-exhibit-neon",
    title: "影像展 + 氛围晚餐",
    scenario: "friends",
    summary: isRepaired ? "先看城市影像展，再按已确认的 18:30 去霓虹餐桌吃饭。" : "先看城市影像展，再去霓虹餐桌吃饭。",
    totalDurationMinutes: isRepaired ? 360 : 330,
    estimatedBudgetCny: 840,
    confidence: isRepaired ? 0.86 : 0.72,
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
        startTime: time,
        endTime: isRepaired ? "20:00" : "19:30",
        durationMinutes: 90,
        notes: isRepaired ? ["18:00 无四人桌，改为已确认的 18:30", "预计排队 8 分钟"] : ["首选时间"],
        evidence: isRepaired
          ? ["checkRestaurantAvailability.restaurant-1830", "checkQueueTime.queue"]
          : ["checkRestaurantAvailability.restaurant-1800"]
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
        input: { restaurantId: "neon-table", partySize: 4, time, contactName: "小明" }
      },
      {
        id: "friends-send-message",
        type: "send_message",
        status: "pending",
        toolName: "sendMessage",
        optional: false,
        input: { to: "小张", content: `搞定了，下午 2 点出发，先看影像展，${time} 去霓虹餐桌。` }
      }
    ],
    alternatives: [],
    risks: isRepaired
      ? [
          {
            code: "REPAIRED_RESTAURANT_TIME",
            message: "18:00 无 4 人桌，已根据工具结果调整为 18:30。",
            severity: "info"
          }
        ]
      : []
  };
}

function planHasFailedAvailabilityAtMealTime(input: VerifyPlanInput) {
  const mealTime = input.plan.timeline.find((step) => step.type === "meal")?.startTime;
  if (!mealTime) {
    return false;
  }

  return input.toolTraces.some(
    (trace) =>
      trace.toolName === "checkRestaurantAvailability" &&
      trace.status === "failed" &&
      JSON.stringify(trace.input).includes(`"time":"${mealTime}"`)
  );
}

export class FakeLLMClient implements LLMClient {
  readonly provider = "fake";

  async chatWithTools(input: ToolCallingInput): Promise<ToolCallingTurn> {
    const userMessage = input.messages.find((item) => item.role === "user")?.content ?? "";
    const isFamily = userMessage.includes("老婆") || userMessage.includes("孩子") || userMessage.includes("亲子");
    const toolMessages = input.messages.filter((item) => item.role === "tool");

    if (toolMessages.length === 0) {
      const calls = isFamily ? fakeFamilyToolCalls() : fakeFriendsToolCalls();
      return {
        content: "",
        toolCalls: calls.map((call) => ({
          id: call.id,
          name: call.toolName,
          input: call.input,
          argumentsJson: JSON.stringify(call.input)
        })),
        finishReason: "tool_calls"
      };
    }

    const sawUnavailableRestaurant = toolMessages.some(
      (item) => item.content.includes("NO_AVAILABILITY") && item.content.includes("restaurant")
    );
    const plan = isFamily ? fakeFamilyPlan() : fakeFriendsPlan(sawUnavailableRestaurant ? "18:30" : "18:00");

    return {
      content: JSON.stringify({
        status: "ready",
        assistantMessage:
          plan.scenario === "family"
            ? "我查好了附近亲子活动、轻食餐厅和排队情况，下面这个下午安排可以一键确认。"
            : "我查好了四人活动、餐厅桌位和排队情况，下面这个下午安排可以一键确认。",
        plan,
        reasonSummary: "Fake ReAct provider composed the final plan from tool observations."
      }),
      toolCalls: [],
      finishReason: "stop"
    };
  }

  async parseGoal(input: ParseGoalInput | string): Promise<ParsedGoalHint> {
    return deterministicParseGoalHint(input);
  }

  async planToolCalls(input: ToolPlanningInput): Promise<ToolPlanningDecision> {
    return {
      calls: input.goal.scenario === "family" ? fakeFamilyToolCalls() : fakeFriendsToolCalls(),
      rationaleSummary: "Fake provider selected deterministic demo tools."
    };
  }

  async composePlan(input: ComposePlanInput): Promise<Plan> {
    return input.goal.scenario === "family" ? fakeFamilyPlan() : fakeFriendsPlan();
  }

  async verifyPlan(input: VerifyPlanInput): Promise<PlanValidationDecision> {
    if (planHasFailedAvailabilityAtMealTime(input)) {
      return {
        isValid: false,
        blockingIssues: ["餐厅目标时间不可用"],
        confidence: 0.45,
        reasonSummary: "需要修复餐厅时间"
      };
    }

    const totalOk = input.plan.totalDurationMinutes >= 240 && input.plan.totalDurationMinutes <= 390;
    return {
      isValid: totalOk,
      blockingIssues: totalOk ? [] : ["Plan duration outside expected range"],
      confidence: totalOk ? Math.max(input.plan.confidence, 0.82) : 0.5,
      reasonSummary: totalOk ? "方案可执行" : "方案时长不满足约束"
    };
  }

  async repairPlan(input: RepairPlanInput): Promise<RepairDecision> {
    return {
      plan: input.plan.scenario === "friends" ? fakeFriendsPlan("18:30") : input.plan,
      additionalToolCalls: [],
      reasonSummary: "Fake provider repaired the plan."
    };
  }

  async draftAssistantReply(input: DraftAssistantReplyInput): Promise<string> {
    return input.fallback;
  }
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return "";
}

function extractJsonObject(text: string): unknown {
  const withoutThinking = stripThinking(text);
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = (fenced?.[1] ?? withoutThinking).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new LLMOutputParseError("Model response did not contain a JSON object");
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new LLMOutputParseError(error instanceof Error ? error.message : "Model response was not valid JSON");
  }
}

function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function nullsToUndefined(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => nullsToUndefined(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, item]) => [key, nullsToUndefined(item)] as const)
        .filter((entry) => entry[1] !== undefined)
    );
  }

  return value;
}

function parseModelOutput<TSchema extends z.ZodTypeAny>(text: string, schema: TSchema): z.output<TSchema> {
  const parsed = schema.safeParse(nullsToUndefined(extractJsonObject(text)));
  if (!parsed.success) {
    throw new LLMOutputParseError(parsed.error.message);
  }

  return parsed.data;
}

function parseModelGoalHint(text: string, provider: ResolvedLLMProvider): ParsedGoalHint {
  return {
    ...parseModelOutput(text, ParsedGoalHintSchema),
    provider
  };
}

function compactForPrompt(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "string" && item.length > 600) {
      return `${item.slice(0, 597)}...`;
    }

    return item;
  });
}

function buildParseGoalPrompt(input: ParseGoalInput) {
  return [
    "你是美团本地短时活动规划 Agent 的目标解析器。",
    "只输出 JSON，不要输出 Markdown 解释。",
    "JSON 字段：scenario(family|friends|unknown), childAge, partySize, startWindow(afternoon|evening|unknown), durationHours({min,max}), preferences, constraints, dietaryNotes, clarificationQuestion, confidence(0-1)。",
    "不要生成预订结果、订单号、支付状态或工具执行结果。",
    `当前时间：${input.now ?? "unknown"}`,
    `用户请求：${input.message}`
  ].join("\n");
}

function buildToolPlanningPrompt(input: ToolPlanningInput) {
  return [
    "你是美团本地短时活动规划 Agent 的工具规划器。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 结构：{ calls: [{ id, toolName, input, reason }], rationaleSummary }。",
    "你必须从 availableTools 中选择工具，不能发明工具名。",
    "工具调用用于获取事实，不能生成订单、预订成功或支付状态。",
    "优先查：用户画像、附近活动、活动名额、餐厅、餐厅桌位、排队、可选配送。需要时可查备选时间。",
    "家庭场景要照顾 5 岁孩子、清淡低脂、少排队；朋友场景要照顾 4 人社交、拍照氛围和聚餐。",
    `当前时间：${input.now ?? "unknown"}`,
    `goal: ${compactForPrompt(input.goal)}`,
    `availableTools: ${compactForPrompt(input.availableTools)}`,
    `existingToolTraces: ${compactForPrompt(input.toolTraces)}`
  ].join("\n");
}

function buildComposePlanPrompt(input: ComposePlanInput) {
  return [
    "你是美团本地短时活动规划 Agent 的方案编排器。",
    "只输出一个严格 JSON Plan 对象，不要 Markdown，不要解释。",
    "Plan JSON 必须包含：id,title,scenario,summary,totalDurationMinutes,estimatedBudgetCny,confidence,timeline,requiredActions,alternatives,risks。",
    "timeline 每项必须包含：id,type,title,startTime,endTime,durationMinutes,notes,evidence；type 只能是 travel,activity,meal,delivery,free_walk。",
    "requiredActions 每项必须包含：id,type,status,toolName,optional,input；type 只能是 reserve_restaurant,book_activity,schedule_delivery,send_message。",
    "必须遵守：",
    "1. 只能基于 goal 和 toolTraces 中出现的地点、活动、餐厅、商品和工具结果编排。",
    "2. requiredActions 的 status 必须是 pending，不能生成 receipt、订单号、支付状态或成功状态。",
    "3. requiredActions 的 toolName 只能是 bookActivity、reserveRestaurant、scheduleDelivery、sendMessage。",
    "4. 如果工具结果显示某个时间不可用，不要把它当作已成功；可以在风险中说明或选择已有工具结果支持的备选。",
    "5. timeline 总时长尽量保持 4-6 小时。",
    `当前时间：${input.now ?? "unknown"}`,
    `goal: ${compactForPrompt(input.goal)}`,
    `toolTraces: ${compactForPrompt(input.toolTraces)}`
  ].join("\n");
}

function buildVerifyPlanPrompt(input: VerifyPlanInput) {
  return [
    "你是美团本地短时活动规划 Agent 的可执行性校验器。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 结构：{ isValid, blockingIssues, confidence, reasonSummary }。",
    "判断 plan 是否被 toolTraces 支撑，是否存在不可用餐厅/活动时间、时长明显不满足、必需动作不完整等问题。",
    "不要生成新方案或执行结果。",
    `当前时间：${input.now ?? "unknown"}`,
    `goal: ${compactForPrompt(input.goal)}`,
    `plan: ${compactForPrompt(input.plan)}`,
    `toolTraces: ${compactForPrompt(input.toolTraces)}`
  ].join("\n");
}

function buildRepairPlanPrompt(input: RepairPlanInput) {
  return [
    "你是美团本地短时活动规划 Agent 的方案修复器。",
    "只输出 JSON，不要 Markdown，不要解释。",
    "JSON 结构：{ plan, additionalToolCalls, reasonSummary }。如果已有工具结果足够，返回修复后的 plan；如还缺事实，可在 additionalToolCalls 中给出需要补查的工具。",
    "修复后的 plan 必须符合 Plan schema；requiredActions 必须保持 pending，不能生成 receipt、订单号、支付状态或成功状态。",
    "只能基于 goal、validation 和 toolTraces 中已有事实修复。",
    `当前时间：${input.now ?? "unknown"}`,
    `goal: ${compactForPrompt(input.goal)}`,
    `validation: ${compactForPrompt(input.validation)}`,
    `plan: ${compactForPrompt(input.plan)}`,
    `toolTraces: ${compactForPrompt(input.toolTraces)}`
  ].join("\n");
}

function buildDraftReplyPrompt(input: DraftAssistantReplyInput) {
  return [
    "你是美团本地短时活动规划 Agent。",
    "写一句简洁、自然的中文回复，说明你会如何按用户约束安排。",
    "禁止声称已经完成预订、下单、支付或发送消息。",
    `场景：${input.scenario}`,
    `用户请求：${input.userMessage}`,
    `兜底文案：${input.fallback}`,
    input.planSummary ? `计划摘要：${input.planSummary}` : "",
    input.clarificationQuestion ? `澄清问题：${input.clarificationQuestion}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function sanitizeReply(text: string, fallback: string) {
  const cleaned = stripThinking(text)
    .replace(/```[\s\S]*?```/g, "")
    .trim()
    .replace(/^["“]|["”]$/g, "");

  if (!cleaned) {
    return fallback;
  }

  return cleaned.length > 240 ? `${cleaned.slice(0, 237)}...` : cleaned;
}

function toOpenAIMessage(message: NativeChatMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      name: message.name,
      content: message.content
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content || null,
      ...(message.reasoningContent ? { reasoning_content: message.reasoningContent } : {}),
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: call.argumentsJson
              }
            }))
          }
        : {})
    };
  }

  return message;
}

function parseToolCallArguments(value: string | undefined) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toolCallsFromMessage(message: { tool_calls?: unknown }): NativeToolCall[] {
  if (!Array.isArray(message.tool_calls)) {
    return [];
  }

  return message.tool_calls
    .map((toolCall) => {
      if (!toolCall || typeof toolCall !== "object") {
        return undefined;
      }

      const call = toolCall as {
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      };
      const name = call.function?.name;
      const argumentsJson = call.function?.arguments ?? "{}";

      if (!call.id || !name) {
        return undefined;
      }

      return {
        id: call.id,
        name,
        argumentsJson,
        input: parseToolCallArguments(argumentsJson)
      };
    })
    .filter((call): call is NativeToolCall => Boolean(call));
}

class OpenAICompatibleToolInvoker implements DeepSeekChatInvoker {
  private readonly client: OpenAI;

  constructor(
    private readonly config: MiniMaxLLMConfig | DeepSeekLLMConfig,
    private readonly deepSeekOptions?: Pick<DeepSeekLLMConfig, "thinkingType" | "reasoningEffort">
  ) {
    this.client = new OpenAI({
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries
    });
  }

  async create(input: DeepSeekChatRequest | NativeToolChatRequest) {
    const completion = await this.client.chat.completions.create(input as any);
    const choice = completion.choices[0];
    const message = choice?.message as
      | { content?: unknown; tool_calls?: unknown; reasoning_content?: unknown }
      | undefined;

    return {
      content: message?.content ?? "",
      toolCalls: message ? toolCallsFromMessage(message) : [],
      finishReason: choice?.finish_reason ?? undefined,
      reasoningContent:
        typeof message?.reasoning_content === "string" && message.reasoning_content.length > 0
          ? message.reasoning_content
          : undefined
    };
  }

  async createToolTurn(input: ToolCallingInput) {
    return this.create({
      model: this.config.model,
      messages: input.messages.map(toOpenAIMessage),
      tools: input.tools,
      tool_choice: "auto",
      ...(this.deepSeekOptions
        ? {
            thinking: { type: this.deepSeekOptions.thinkingType },
            reasoning_effort: this.deepSeekOptions.reasoningEffort
          }
        : {}),
      stream: false,
      max_tokens: this.config.maxTokens,
      temperature: 0.2
    });
  }
}

export class MiniMaxLLMClient implements LLMClient {
  readonly provider = "minimax";
  private readonly model: ChatModelInvoker;
  private readonly toolModel: OpenAICompatibleToolInvoker;

  constructor(
    readonly config: MiniMaxLLMConfig,
    model?: ChatModelInvoker,
    toolModel?: OpenAICompatibleToolInvoker
  ) {
    this.model =
      model ??
      new ChatOpenAI({
        model: config.model,
        apiKey: config.apiKey,
        temperature: 0.2,
        maxTokens: config.maxTokens,
        modelKwargs: {
          response_format: { type: "json_object" }
        },
        configuration: {
          baseURL: config.baseUrl,
          timeout: config.timeoutMs,
          maxRetries: config.maxRetries
        }
      });
    this.toolModel = toolModel ?? new OpenAICompatibleToolInvoker(config);
  }

  async chatWithTools(input: ToolCallingInput): Promise<ToolCallingTurn> {
    const response = await this.toolModel.createToolTurn(input);
    return {
      content: textFromContent(response.content),
      toolCalls: response.toolCalls ?? [],
      finishReason: response.finishReason,
      reasoningContent: response.reasoningContent
    };
  }

  async parseGoal(input: ParseGoalInput | string): Promise<ParsedGoalHint> {
    const response = await this.model.invoke(buildParseGoalPrompt(normalizeInput(input)));
    return parseModelGoalHint(textFromContent(response.content), "minimax");
  }

  async planToolCalls(input: ToolPlanningInput): Promise<ToolPlanningDecision> {
    const response = await this.model.invoke(buildToolPlanningPrompt(input));
    return parseModelOutput(textFromContent(response.content), ToolPlanningDecisionSchema);
  }

  async composePlan(input: ComposePlanInput): Promise<Plan> {
    const response = await this.model.invoke(buildComposePlanPrompt(input));
    return parseModelOutput(textFromContent(response.content), PlanSchema);
  }

  async verifyPlan(input: VerifyPlanInput): Promise<PlanValidationDecision> {
    const response = await this.model.invoke(buildVerifyPlanPrompt(input));
    return parseModelOutput(textFromContent(response.content), PlanValidationDecisionSchema);
  }

  async repairPlan(input: RepairPlanInput): Promise<RepairDecision> {
    const response = await this.model.invoke(buildRepairPlanPrompt(input));
    return parseModelOutput(textFromContent(response.content), RepairDecisionSchema);
  }

  async draftAssistantReply(input: DraftAssistantReplyInput): Promise<string> {
    const response = await this.model.invoke(buildDraftReplyPrompt(input));
    return sanitizeReply(textFromContent(response.content), input.fallback);
  }
}

export class DeepSeekLLMClient implements LLMClient {
  readonly provider = "deepseek";
  private readonly model: DeepSeekChatInvoker;

  constructor(
    readonly config: DeepSeekLLMConfig,
    model?: DeepSeekChatInvoker
  ) {
    this.model =
      model ??
      new OpenAICompatibleToolInvoker(config, {
        thinkingType: config.thinkingType,
        reasoningEffort: config.reasoningEffort
      });
  }

  async chatWithTools(input: ToolCallingInput): Promise<ToolCallingTurn> {
    const response = isNativeToolTurnInvoker(this.model)
      ? await this.model.createToolTurn(input)
      : await this.model.create({
          model: this.config.model,
          messages: input.messages.map(toOpenAIMessage),
          tools: input.tools,
          tool_choice: "auto",
          thinking: { type: this.config.thinkingType },
          reasoning_effort: this.config.reasoningEffort,
          stream: false,
          max_tokens: this.config.maxTokens,
          temperature: 0.2
        });

    return {
      content: textFromContent(response.content),
      toolCalls: response.toolCalls ?? [],
      finishReason: response.finishReason,
      reasoningContent: response.reasoningContent
    };
  }

  private async invokePrompt(prompt: string, options: { json?: boolean } = {}) {
    const json = options.json ?? true;
    return this.model.create({
      model: this.config.model,
      messages: [
        {
          role: "system",
          content: json
            ? "You are a JSON-only assistant. Return exactly one valid JSON object and no Markdown."
            : "You are a helpful assistant."
        },
        { role: "user", content: prompt }
      ],
      thinking: { type: this.config.thinkingType },
      reasoning_effort: this.config.reasoningEffort,
      stream: false,
      max_tokens: this.config.maxTokens,
      temperature: 0.2,
      ...(json ? { response_format: { type: "json_object" as const } } : {})
    });
  }

  async parseGoal(input: ParseGoalInput | string): Promise<ParsedGoalHint> {
    const response = await this.invokePrompt(buildParseGoalPrompt(normalizeInput(input)));
    return parseModelGoalHint(textFromContent(response.content), "deepseek");
  }

  async planToolCalls(input: ToolPlanningInput): Promise<ToolPlanningDecision> {
    const response = await this.invokePrompt(buildToolPlanningPrompt(input));
    return parseModelOutput(textFromContent(response.content), ToolPlanningDecisionSchema);
  }

  async composePlan(input: ComposePlanInput): Promise<Plan> {
    const response = await this.invokePrompt(buildComposePlanPrompt(input));
    return parseModelOutput(textFromContent(response.content), PlanSchema);
  }

  async verifyPlan(input: VerifyPlanInput): Promise<PlanValidationDecision> {
    const response = await this.invokePrompt(buildVerifyPlanPrompt(input));
    return parseModelOutput(textFromContent(response.content), PlanValidationDecisionSchema);
  }

  async repairPlan(input: RepairPlanInput): Promise<RepairDecision> {
    const response = await this.invokePrompt(buildRepairPlanPrompt(input));
    return parseModelOutput(textFromContent(response.content), RepairDecisionSchema);
  }

  async draftAssistantReply(input: DraftAssistantReplyInput): Promise<string> {
    const response = await this.invokePrompt(buildDraftReplyPrompt(input), { json: false });
    return sanitizeReply(textFromContent(response.content), input.fallback);
  }
}

export type CreateLLMClientOptions = {
  env?: EnvLike;
  model?: ChatModelInvoker | DeepSeekChatInvoker;
};

function isChatModelInvoker(model: CreateLLMClientOptions["model"]): model is ChatModelInvoker {
  return Boolean(model && "invoke" in model);
}

function isDeepSeekChatInvoker(model: CreateLLMClientOptions["model"]): model is DeepSeekChatInvoker {
  return Boolean(model && "create" in model);
}

function isNativeToolTurnInvoker(model: DeepSeekChatInvoker): model is NativeToolTurnInvoker {
  return "createToolTurn" in model && typeof model.createToolTurn === "function";
}

export function createLLMClient(options: CreateLLMClientOptions = {}): LLMClient {
  const config = loadLLMConfig(options.env);
  if (config.provider === "fake") {
    return new FakeLLMClient();
  }

  if (config.provider === "deepseek") {
    return new DeepSeekLLMClient(config, isDeepSeekChatInvoker(options.model) ? options.model : undefined);
  }

  return new MiniMaxLLMClient(config, isChatModelInvoker(options.model) ? options.model : undefined);
}
