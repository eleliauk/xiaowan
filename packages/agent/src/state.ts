import { Annotation } from "@langchain/langgraph";
import type { LLMClient } from "@mh/llm";
import type {
  AgentMessage,
  AgentStreamEvent,
  ExecutionReceipt,
  Plan,
  PlannedToolCall,
  PlanValidationDecision,
  ToolCallTrace,
  ToolError,
  UserGoal
} from "@mh/shared";

export type AgentGraphState = {
  sessionId: string;
  mode: "plan_only" | "execute_confirmed_plan";
  userMessage: string;
  now: string;
  streamContext?: {
    runId: string;
    threadId: string;
    timestamp: string;
  };
  eventSink?: (event: AgentStreamEvent) => void | Promise<void>;
  llmClient?: LLMClient;
  llmTrace?: {
    provider: "fake" | "minimax" | "deepseek";
    fallback?: boolean;
    errorCode?: string;
  };
  goal?: UserGoal;
  candidates: Plan[];
  plannedToolCalls: PlannedToolCall[];
  selectedPlan?: Plan;
  planValidation?: PlanValidationDecision;
  confirmedPlanId?: string;
  messages: AgentMessage[];
  toolTraces: ToolCallTrace[];
  repairCount: number;
  loopCount: number;
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
  streamContext: Annotation<{ runId: string; threadId: string; timestamp: string } | undefined>(),
  eventSink: Annotation<((event: AgentStreamEvent) => void | Promise<void>) | undefined>(),
  llmClient: Annotation<LLMClient | undefined>(),
  llmTrace: Annotation<
    { provider: "fake" | "minimax" | "deepseek"; fallback?: boolean; errorCode?: string } | undefined
  >(),
  goal: Annotation<UserGoal | undefined>(),
  candidates: Annotation<Plan[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  plannedToolCalls: Annotation<PlannedToolCall[]>({
    reducer: (_current, update) => update,
    default: () => []
  }),
  selectedPlan: Annotation<Plan | undefined>(),
  planValidation: Annotation<PlanValidationDecision | undefined>(),
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
  loopCount: Annotation<number>({
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
