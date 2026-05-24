import type { AgentGraphState } from "../state";

export async function waitForConfirmation(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.selectedPlan) {
    return {};
  }

  return {
    selectedPlan: {
      ...state.selectedPlan,
      requiredActions: state.selectedPlan.requiredActions.map((action) => ({
        ...action,
        status: "pending"
      }))
    }
  };
}
