import { createLLMClient } from "@mh/llm";
import type { AgentGraphState } from "../state";

export async function verifyPlan(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (state.error) {
    return {};
  }

  if (!state.goal || !state.selectedPlan) {
    return {
      planValidation: {
        isValid: false,
        blockingIssues: ["No selected plan"],
        confidence: 0,
        reasonSummary: "Missing plan"
      }
    };
  }

  const client = state.llmClient ?? createLLMClient();

  try {
    const validation = await client.verifyPlan({
      goal: state.goal,
      plan: state.selectedPlan,
      toolTraces: state.toolTraces,
      now: state.now
    });

    return {
      planValidation: validation,
      selectedPlan: validation.isValid
        ? {
            ...state.selectedPlan,
            confidence: Math.max(state.selectedPlan.confidence, validation.confidence)
          }
        : state.selectedPlan,
      llmTrace: { provider: client.provider }
    };
  } catch (error) {
    return {
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "LLM plan verification failed",
        recoverable: false
      },
      llmTrace: {
        provider: client.provider,
        errorCode:
          error && typeof error === "object" && "code" in error && typeof error.code === "string"
            ? error.code
            : "LLM_RUNTIME_ERROR"
      }
    };
  }
}
