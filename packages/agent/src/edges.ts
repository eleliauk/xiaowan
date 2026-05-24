import type { AgentGraphState } from "./state";

export function routeAfterReActPlanning(state: AgentGraphState) {
  if (state.error || state.needsUserInput || !state.selectedPlan) {
    return "end";
  }

  return "waitForConfirmation";
}

export function routeAfterParseGoal(state: AgentGraphState) {
  if (state.error) {
    return "end";
  }

  return state.needsUserInput ? "waitForUser" : "generateCandidates";
}

export function routeAfterTools(state: AgentGraphState) {
  return state.error ? "end" : "composePlan";
}

export function routeAfterCompose(state: AgentGraphState) {
  return state.error ? "end" : "verifyPlan";
}

export function routeAfterVerify(state: AgentGraphState) {
  if (state.error) {
    return "end";
  }

  if (state.planValidation?.isValid && state.planValidation.confidence >= 0.75) {
    return "waitForConfirmation";
  }

  if (state.repairCount >= 2) {
    return "waitForConfirmation";
  }

  return "repairPlan";
}

export function routeAfterRepair(state: AgentGraphState) {
  if (state.error) {
    return "end";
  }

  if (state.plannedToolCalls.length > 0 && state.loopCount < 4) {
    return "callTools";
  }

  return "verifyPlan";
}
