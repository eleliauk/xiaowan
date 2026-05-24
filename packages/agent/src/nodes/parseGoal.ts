import { familyMembers, friendMembers, homeLocation } from "@mh/data";
import type { UserGoal } from "@mh/shared";
import { message } from "../helpers";
import type { AgentGraphState } from "../state";

export async function parseGoal(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  const text = state.userMessage;
  const scenario =
    text.includes("老婆") || text.includes("孩子")
      ? "family"
      : text.includes("朋友") || text.includes("4") || text.includes("四")
        ? "friends"
        : "unknown";

  if (scenario === "unknown") {
    return {
      needsUserInput: {
        question: "这次是和家人还是朋友一起出门？",
        options: ["家人", "朋友"]
      },
      messages: [
        message("user", text, state.now),
        message("assistant", "我先确认一下同行人群，这会影响活动和餐厅选择。", state.now)
      ]
    };
  }

  const goal: UserGoal = {
    rawText: text,
    scenario,
    date: state.now.slice(0, 10),
    startWindow: "afternoon",
    durationHours: { min: 4, max: 6 },
    origin: homeLocation,
    party: scenario === "family" ? familyMembers : friendMembers,
    preferences:
      scenario === "family"
        ? ["child_friendly", "healthy", "light", "low_fat", "low_queue"]
        : ["friends", "social", "atmosphere", "photo", "walkable"],
    constraints:
      scenario === "family"
        ? ["near_home", "kid_age_5", "wife_losing_weight", "avoid_long_queue"]
        : ["near_home", "party_size_4", "2_men_2_women", "meal_required"]
  };

  return {
    goal,
    needsUserInput: undefined,
    messages: [
      message("user", text, state.now),
      message(
        "assistant",
        scenario === "family"
          ? "收到，我会按亲子友好、清淡饮食、少排队来安排。"
          : "收到，我会按四人社交、氛围餐厅和饭前饭后活动来安排。",
        state.now
      )
    ]
  };
}
