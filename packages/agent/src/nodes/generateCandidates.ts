import { createLLMClient } from "@mh/llm";
import { createDefaultToolRegistry } from "@mh/tools";
import type { AgentGraphState } from "../state";

export async function generateCandidates(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal || state.goal.scenario === "unknown") {
    return {};
  }

  const client = state.llmClient ?? createLLMClient();
  const registry = createDefaultToolRegistry();

  try {
    const decision = await client.planToolCalls({
      goal: state.goal,
      toolTraces: state.toolTraces,
      availableTools: registry.list().map((tool) => ({
        name: tool.name,
        description: tool.description
      })),
      now: state.now
    });

    return {
      plannedToolCalls: decision.calls,
      loopCount: state.loopCount + 1,
      llmTrace: { provider: client.provider }
    };
  } catch (error) {
    return {
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "LLM tool planning failed",
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
