import { familyMembers, friendMembers, homeLocation } from "@mh/data";
import { createLLMClient, type LLMClient, type ParsedGoalHint } from "@mh/llm";
import type { UserGoal } from "@mh/shared";
import { message } from "../helpers";
import type { AgentGraphState } from "../state";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function basePreferences(scenario: ParsedGoalHint["scenario"]) {
  if (scenario === "family") {
    return ["child_friendly", "healthy", "light", "low_fat", "low_queue"];
  }

  if (scenario === "friends") {
    return ["friends", "social", "atmosphere", "photo", "walkable"];
  }

  return [];
}

function baseConstraints(scenario: ParsedGoalHint["scenario"]) {
  if (scenario === "family") {
    return ["near_home", "kid_age_5", "wife_losing_weight", "avoid_long_queue"];
  }

  if (scenario === "friends") {
    return ["near_home", "party_size_4", "2_men_2_women", "meal_required"];
  }

  return [];
}

function defaultReply(scenario: ParsedGoalHint["scenario"]) {
  return scenario === "family"
    ? "收到，我会按亲子友好、清淡饮食、少排队来安排。"
    : "收到，我会按四人社交、氛围餐厅和饭前饭后活动来安排。";
}

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return "LLM_RUNTIME_ERROR";
}

async function parseWithLLM(state: AgentGraphState): Promise<{
  client: LLMClient;
  hint?: ParsedGoalHint;
  trace: AgentGraphState["llmTrace"];
  error?: AgentGraphState["error"];
}> {
  const preferredClient = state.llmClient ?? createLLMClient();

  try {
    return {
      client: preferredClient,
      hint: await preferredClient.parseGoal({ message: state.userMessage, now: state.now }),
      trace: { provider: preferredClient.provider }
    };
  } catch (error) {
    return {
      client: preferredClient,
      trace: {
        provider: preferredClient.provider,
        errorCode: errorCode(error)
      },
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "LLM goal parsing failed",
        recoverable: preferredClient.provider === "fake"
      }
    };
  }
}

async function draftReply(client: LLMClient, text: string, scenario: ParsedGoalHint["scenario"], fallback: string) {
  try {
    return await client.draftAssistantReply({
      userMessage: text,
      scenario,
      fallback
    });
  } catch {
    return fallback;
  }
}

function toGoal(text: string, hint: ParsedGoalHint, now: string): UserGoal {
  const scenario = hint.scenario === "friends" ? "friends" : "family";

  return {
    rawText: text,
    scenario,
    date: now.slice(0, 10),
    startWindow: hint.startWindow === "evening" ? "evening" : "afternoon",
    durationHours: hint.durationHours ?? { min: 4, max: 6 },
    origin: homeLocation,
    party: scenario === "family" ? familyMembers : friendMembers,
    preferences: unique([...basePreferences(scenario), ...(hint.preferences ?? []), ...(hint.dietaryNotes ?? [])]),
    constraints: unique([...baseConstraints(scenario), ...(hint.constraints ?? [])])
  };
}

export async function parseGoal(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  const text = state.userMessage;
  const { client, hint, trace, error } = await parseWithLLM(state);

  if (!hint) {
    return {
      llmTrace: trace,
      error,
      messages: [
        message("user", text, state.now),
        message("assistant", "我理解出行目标时遇到了问题，暂时无法继续规划。", state.now)
      ]
    };
  }

  if (hint.scenario === "unknown") {
    const question = hint.clarificationQuestion ?? "这次是和家人还是朋友一起出门？";

    return {
      llmTrace: trace,
      needsUserInput: {
        question,
        options: ["家人", "朋友"]
      },
      messages: [
        message("user", text, state.now),
        message("assistant", "我先确认一下同行人群，这会影响活动和餐厅选择。", state.now)
      ]
    };
  }

  const fallback = defaultReply(hint.scenario);
  const assistantReply = await draftReply(client, text, hint.scenario, fallback);

  return {
    llmTrace: trace,
    goal: toGoal(text, hint, state.now),
    needsUserInput: undefined,
    messages: [message("user", text, state.now), message("assistant", assistantReply, state.now)]
  };
}
