import type { PlanAction, PlanStep } from "@mh/shared";
import { replaceTimelineStep } from "../helpers";
import type { AgentGraphState } from "../state";

export async function repairPlan(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.selectedPlan || state.selectedPlan.scenario !== "friends") {
    return { repairCount: state.repairCount + 1 };
  }

  const repairedMeal: PlanStep = {
    id: "friends-meal",
    type: "meal",
    title: "氛围晚餐",
    placeName: "霓虹餐桌",
    address: "望京文化中心 1 层",
    startTime: "18:30",
    endTime: "20:00",
    durationMinutes: 90,
    notes: ["18:00 无四人桌，已自动调整到 18:30", "18:30 已查到 4 人桌", "预计排队 8 分钟"],
    evidence: []
  };

  const repairedActions = state.selectedPlan.requiredActions.map((action): PlanAction => {
    if (action.id !== "friends-reserve-meal") {
      return action;
    }

    return {
      ...action,
      input: { restaurantId: "neon-table", partySize: 4, time: "18:30", contactName: "小明" }
    };
  });

  const plan = replaceTimelineStep(state.selectedPlan, "friends-meal", repairedMeal);

  return {
    repairCount: state.repairCount + 1,
    selectedPlan: {
      ...plan,
      confidence: 0.86,
      requiredActions: repairedActions,
      risks: [
        ...plan.risks,
        {
          code: "REPAIRED_RESTAURANT_TIME",
          message: "首选餐厅 18:00 无 4 人桌，已调整为 18:30。",
          severity: "info"
        }
      ]
    }
  };
}
