import type { LLMClient } from "@mh/core/llm";
import type { AgentMessage, AgentStreamEvent, ExecutionReceipt, Plan, ToolCallTrace, ToolError } from "@mh/core/shared";

export type AgentRuntimeState = {
  sessionId: string;
  userMessage: string;
  now: string;
  streamContext?: {
    runId: string;
    threadId: string;
    timestamp: string;
  };
  eventSink?: (event: AgentStreamEvent) => void | Promise<void>;
  llmClient?: LLMClient;
  selectedPlan?: Plan;
  messages: AgentMessage[];
  toolTraces: ToolCallTrace[];
  needsUserInput?: {
    question: string;
    options?: string[];
  };
  executionReceipts: ExecutionReceipt[];
  error?: ToolError;
};
