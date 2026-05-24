import type { AgentGraphState } from "./state";

export function routeAfterParseGoal(state: AgentGraphState) {
  return state.needsUserInput ? "waitForUser" : "generateCandidates";
}

export function routeAfterVerify(state: AgentGraphState) {
  if (state.planValidation?.isValid && state.planValidation.confidence >= 0.75) {
    return "waitForConfirmation";
  }

  if (state.repairCount >= 2) {
    return "waitForConfirmation";
  }

  return "repairPlan";
}
