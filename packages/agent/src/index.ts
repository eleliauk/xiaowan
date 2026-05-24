import type { LLMClient } from "@mh/llm";
import type { AgentRunOutput, AgentStreamEvent, Plan } from "@mh/shared";
import { toExecutionResponse, toPlanningResponse } from "./adapters/toApiResponse";
import { createExecutionGraph, createPlanningGraph } from "./graph";
import { createId } from "./helpers";
import type { AgentGraphState } from "./state";

export type RunPlanningInput = {
  sessionId?: string;
  userMessage: string;
  now: string;
  llmClient?: LLMClient;
  streamContext?: {
    runId: string;
    threadId: string;
    timestamp: string;
  };
  eventSink?: (event: AgentStreamEvent) => void | Promise<void>;
};

export type ExecutePlanInput = {
  sessionId: string;
  plan: Plan;
  now: string;
  streamContext?: {
    runId: string;
    threadId: string;
    timestamp: string;
  };
  eventSink?: (event: AgentStreamEvent) => void | Promise<void>;
};

function baseState(input: RunPlanningInput): AgentGraphState {
  return {
    sessionId: input.sessionId ?? createId("sess"),
    mode: "plan_only",
    userMessage: input.userMessage,
    now: input.now,
    streamContext: input.streamContext,
    eventSink: input.eventSink,
    llmClient: input.llmClient,
    candidates: [],
    plannedToolCalls: [],
    messages: [],
    toolTraces: [],
    repairCount: 0,
    loopCount: 0,
    executionReceipts: []
  };
}

export async function runPlanning(input: RunPlanningInput): Promise<AgentRunOutput> {
  const graph = createPlanningGraph();
  const state = await graph.invoke(baseState(input));
  return toPlanningResponse(state as AgentGraphState);
}

export async function executePlan(input: ExecutePlanInput): Promise<AgentRunOutput> {
  const graph = createExecutionGraph();
  const state = await graph.invoke({
    sessionId: input.sessionId,
    mode: "execute_confirmed_plan",
    userMessage: "",
    now: input.now,
    streamContext: input.streamContext,
    eventSink: input.eventSink,
    candidates: [],
    plannedToolCalls: [],
    selectedPlan: input.plan,
    confirmedPlanId: input.plan.id,
    messages: [],
    toolTraces: [],
    repairCount: 0,
    loopCount: 0,
    executionReceipts: []
  } satisfies AgentGraphState);

  return toExecutionResponse(state as AgentGraphState);
}

export * from "./chatStream";
export * from "./graph";
export * from "./runtime";
export * from "./state";
