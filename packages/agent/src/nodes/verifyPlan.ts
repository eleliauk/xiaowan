import type { AgentGraphState } from "../state";

export async function verifyPlan(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.selectedPlan) {
    return {
      planValidation: {
        isValid: false,
        blockingIssues: ["No selected plan"],
        confidence: 0
      }
    };
  }

  const meal = state.selectedPlan.timeline.find((step) => step.type === "meal");
  const noAvailability = state.toolTraces.find(
    (trace) =>
      trace.toolName === "checkRestaurantAvailability" &&
      trace.status === "failed" &&
      trace.error?.code === "NO_AVAILABILITY" &&
      JSON.stringify(trace.input).includes(`"time":"${meal?.startTime}"`)
  );

  if (noAvailability) {
    return {
      planValidation: {
        isValid: false,
        blockingIssues: [noAvailability.error?.message ?? "Restaurant unavailable"],
        confidence: state.selectedPlan.confidence
      }
    };
  }

  const totalOk = state.selectedPlan.totalDurationMinutes >= 240 && state.selectedPlan.totalDurationMinutes <= 390;

  return {
    planValidation: {
      isValid: totalOk,
      blockingIssues: totalOk ? [] : ["Plan duration outside expected range"],
      confidence: totalOk ? Math.max(state.selectedPlan.confidence, 0.82) : 0.5
    },
    selectedPlan: {
      ...state.selectedPlan,
      confidence: totalOk ? Math.max(state.selectedPlan.confidence, 0.82) : state.selectedPlan.confidence
    }
  };
}
