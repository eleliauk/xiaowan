import type { AgentRunOutput } from "@mh/core/shared";
import { getAgentRuntime } from "./agentRuntime";

export function saveSession(session: AgentRunOutput) {
  return getAgentRuntime().saveSession(session);
}

export function getSession(sessionId: string) {
  return getAgentRuntime().getSession(sessionId);
}
