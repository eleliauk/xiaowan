import type { AgentGraphState } from "../state";

export async function generateCandidates(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal || state.goal.scenario === "unknown") {
    return {};
  }

  return {
    candidates: [
      {
        id: `${state.goal.scenario}-steady`,
        title: state.goal.scenario === "family" ? "轻松亲子半日" : "展览 Citywalk 聚餐",
        scenario: state.goal.scenario,
        summary: "候选路线骨架，后续由工具校验可行性。",
        totalDurationMinutes: 0,
        estimatedBudgetCny: 0,
        confidence: 0,
        timeline: [],
        requiredActions: [],
        alternatives: [],
        risks: []
      }
    ]
  };
}
