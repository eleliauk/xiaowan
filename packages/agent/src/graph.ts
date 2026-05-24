import { END, START, StateGraph } from "@langchain/langgraph";
import { routeAfterReActPlanning } from "./edges";
import { executeActions } from "./nodes/executeActions";
import { runReActPlanning } from "./nodes/runReActPlanning";
import { waitForConfirmation } from "./nodes/waitForConfirmation";
import { AgentGraphStateAnnotation } from "./state";

export function createPlanningGraph() {
  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("runReActPlanning", runReActPlanning)
    .addNode("waitForConfirmation", waitForConfirmation)
    .addEdge(START, "runReActPlanning")
    .addConditionalEdges("runReActPlanning", routeAfterReActPlanning, {
      end: END,
      waitForConfirmation: "waitForConfirmation"
    })
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
