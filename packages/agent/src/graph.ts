import { END, START, StateGraph } from "@langchain/langgraph";
import { callTools } from "./nodes/callTools";
import { composePlan } from "./nodes/composePlan";
import { executeActions } from "./nodes/executeActions";
import { generateCandidates } from "./nodes/generateCandidates";
import { parseGoal } from "./nodes/parseGoal";
import { repairPlan } from "./nodes/repairPlan";
import { verifyPlan } from "./nodes/verifyPlan";
import { waitForConfirmation } from "./nodes/waitForConfirmation";
import { routeAfterParseGoal, routeAfterVerify } from "./edges";
import { AgentGraphStateAnnotation } from "./state";

export function createPlanningGraph() {
  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("parseGoal", parseGoal)
    .addNode("generateCandidates", generateCandidates)
    .addNode("callTools", callTools)
    .addNode("composePlan", composePlan)
    .addNode("verifyPlan", verifyPlan)
    .addNode("repairPlan", repairPlan)
    .addNode("waitForConfirmation", waitForConfirmation)
    .addEdge(START, "parseGoal")
    .addConditionalEdges("parseGoal", routeAfterParseGoal, {
      waitForUser: END,
      generateCandidates: "generateCandidates"
    })
    .addEdge("generateCandidates", "callTools")
    .addEdge("callTools", "composePlan")
    .addEdge("composePlan", "verifyPlan")
    .addConditionalEdges("verifyPlan", routeAfterVerify, {
      waitForConfirmation: "waitForConfirmation",
      repairPlan: "repairPlan"
    })
    .addEdge("repairPlan", "verifyPlan")
    .addEdge("waitForConfirmation", END)
    .compile();
}

export function createExecutionGraph() {
  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("executeActions", executeActions)
    .addEdge(START, "executeActions")
    .addEdge("executeActions", END)
    .compile();
}
