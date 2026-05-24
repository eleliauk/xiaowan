import { createDefaultToolRegistry } from "@mh/tools";
import { tracedToolCall } from "../helpers";
import type { AgentGraphState } from "../state";

export async function callTools(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal || state.error || state.plannedToolCalls.length === 0) {
    return {};
  }

  const registry = createDefaultToolRegistry();
  const knownToolNames = new Set(registry.list().map((tool) => tool.name));
  const illegalCall = state.plannedToolCalls.find((call) => !knownToolNames.has(call.toolName));

  if (illegalCall) {
    return {
      plannedToolCalls: [],
      error: {
        code: "VALIDATION_ERROR",
        message: `LLM selected unknown tool: ${illegalCall.toolName}`,
        recoverable: false
      }
    };
  }

  let traces = state.toolTraces;

  for (const plannedCall of state.plannedToolCalls) {
    const result = await tracedToolCall(plannedCall.toolName, plannedCall.input, traces, plannedCall.id);
    traces = result.toolTraces;
  }

  const fatalTrace = traces.find((trace) => trace.status === "failed" && trace.error?.recoverable === false);

  return {
    plannedToolCalls: [],
    toolTraces: traces,
    error: fatalTrace?.error
  };
}
