import type { AgentRunOutput, Plan } from "@mh/shared";
import { createId } from "./helpers";
import { createExecutionGraph, createPlanningGraph } from "./graph";
import { toExecutionResponse, toPlanningResponse } from "./adapters/toApiResponse";
import type { AgentGraphState } from "./state";

export type RunPlanningInput = {
  sessionId?: string;
  userMessage: string;
  now: string;
};

export type ExecutePlanInput = {
  sessionId: string;
  plan: Plan;
  now: string;
};

function baseState(input: RunPlanningInput): AgentGraphState {
  return {
    sessionId: input.sessionId ?? createId("sess"),
    mode: "plan_only",
    userMessage: input.userMessage,
    now: input.now,
    candidates: [],
    messages: [],
    toolTraces: [],
    repairCount: 0,
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
    candidates: [],
    selectedPlan: input.plan,
    confirmedPlanId: input.plan.id,
    messages: [],
    toolTraces: [],
    repairCount: 0,
    executionReceipts: []
  } satisfies AgentGraphState);

  return toExecutionResponse(state as AgentGraphState);
}

export * from "./graph";
export * from "./state";
export * from "./chatStream";
