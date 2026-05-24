import type { AgentRunOutput } from "@mh/shared";
import { getAgentRuntime } from "./agentRuntime";

export function saveSession(session: AgentRunOutput) {
  return getAgentRuntime().saveSession(session);
}

export function getSession(sessionId: string) {
  return getAgentRuntime().getSession(sessionId);
}
