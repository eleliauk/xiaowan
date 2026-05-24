import { Annotation } from "@langchain/langgraph";
import type {
  AgentMessage,
  ExecutionReceipt,
  Plan,
  ToolCallTrace,
  ToolError,
  UserGoal
} from "@mh/shared";

export type PlanValidation = {
  isValid: boolean;
  blockingIssues: string[];
  confidence: number;
};

export type AgentGraphState = {
  sessionId: string;
  mode: "plan_only" | "execute_confirmed_plan";
  userMessage: string;
  now: string;
  goal?: UserGoal;
  candidates: Plan[];
  selectedPlan?: Plan;
  planValidation?: PlanValidation;
  confirmedPlanId?: string;
  messages: AgentMessage[];
  toolTraces: ToolCallTrace[];
  repairCount: number;
  needsUserInput?: {
    question: string;
    options?: string[];
  };
  executionReceipts: ExecutionReceipt[];
  error?: ToolError;
};

export const AgentGraphStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  mode: Annotation<"plan_only" | "execute_confirmed_plan">(),
  userMessage: Annotation<string>(),
  now: Annotation<string>(),
  goal: Annotation<UserGoal | undefined>(),
  candidates: Annotation<Plan[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  selectedPlan: Annotation<Plan | undefined>(),
  planValidation: Annotation<PlanValidation | undefined>(),
  confirmedPlanId: Annotation<string | undefined>(),
  messages: Annotation<AgentMessage[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  toolTraces: Annotation<ToolCallTrace[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  repairCount: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0
  }),
  needsUserInput: Annotation<{ question: string; options?: string[] } | undefined>(),
  executionReceipts: Annotation<ExecutionReceipt[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  error: Annotation<ToolError | undefined>()
});
