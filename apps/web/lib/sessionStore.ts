import type { AgentRunOutput } from "@mh/shared";

const sessions = new Map<string, AgentRunOutput>();

export function saveSession(session: AgentRunOutput) {
  sessions.set(session.sessionId, session);
  return session;
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}
