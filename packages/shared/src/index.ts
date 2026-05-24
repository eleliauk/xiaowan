import { z } from "zod";

export const ScenarioSchema = z.enum(["family", "friends", "unknown"]);
export type Scenario = z.infer<typeof ScenarioSchema>;

export const PartyMemberSchema = z.object({
  role: z.string(),
  label: z.string(),
  age: z.number().optional(),
  notes: z.array(z.string()).default([])
});
export type PartyMember = z.infer<typeof PartyMemberSchema>;

export const LocationSchema = z.object({
  label: z.string(),
  address: z.string().optional(),
  lat: z.number(),
  lng: z.number()
});
export type Location = z.infer<typeof LocationSchema>;

export const UserGoalSchema = z.object({
  rawText: z.string(),
  scenario: ScenarioSchema,
  date: z.string(),
  startWindow: z.enum(["afternoon", "evening", "unknown"]),
  durationHours: z.object({
    min: z.number(),
    max: z.number()
  }),
  origin: LocationSchema,
  party: z.array(PartyMemberSchema),
  preferences: z.array(z.string()),
  constraints: z.array(z.string())
});
export type UserGoal = z.infer<typeof UserGoalSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  type: z.enum(["travel", "activity", "meal", "delivery", "free_walk"]),
  title: z.string(),
  placeName: z.string().optional(),
  address: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  durationMinutes: z.number(),
  notes: z.array(z.string()),
  evidence: z.array(z.string()).default([])
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const ExecutionReceiptSchema = z.object({
  id: z.string(),
  type: z.enum(["activity_booking", "restaurant_reservation", "delivery_order", "message_send"]),
  targetName: z.string(),
  time: z.string().optional(),
  status: z.enum(["confirmed", "sent", "scheduled", "failed"]),
  details: z.record(z.unknown()).default({})
});
export type ExecutionReceipt = z.infer<typeof ExecutionReceiptSchema>;

export const PlanActionSchema = z.object({
  id: z.string(),
  type: z.enum(["reserve_restaurant", "book_activity", "schedule_delivery", "send_message"]),
  status: z.enum(["pending", "running", "succeeded", "failed", "skipped"]),
  toolName: z.string(),
  input: z.unknown(),
  optional: z.boolean().default(false),
  receipt: ExecutionReceiptSchema.optional(),
  fallbackActionId: z.string().optional()
});
export type PlanAction = z.infer<typeof PlanActionSchema>;

export const PlanRiskSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warning", "blocking"])
});
export type PlanRisk = z.infer<typeof PlanRiskSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  scenario: z.enum(["family", "friends"]),
  summary: z.string(),
  totalDurationMinutes: z.number(),
  estimatedBudgetCny: z.number(),
  confidence: z.number(),
  timeline: z.array(PlanStepSchema),
  requiredActions: z.array(PlanActionSchema),
  alternatives: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        reason: z.string()
      })
    )
    .default([]),
  risks: z.array(PlanRiskSchema).default([])
});
export type Plan = z.infer<typeof PlanSchema>;

export const ToolErrorSchema = z.object({
  code: z.enum([
    "NO_AVAILABILITY",
    "QUEUE_TOO_LONG",
    "OUT_OF_BUSINESS_HOURS",
    "DELIVERY_UNAVAILABLE",
    "VALIDATION_ERROR",
    "UNKNOWN"
  ]),
  message: z.string(),
  recoverable: z.boolean(),
  suggestedFallback: z.string().optional()
});
export type ToolError = z.infer<typeof ToolErrorSchema>;

export const ToolCallTraceSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown().optional(),
  status: z.enum(["running", "succeeded", "failed"]),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  error: ToolErrorSchema.optional()
});
export type ToolCallTrace = z.infer<typeof ToolCallTraceSchema>;

export const AgentMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string()
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentRunOutputSchema = z.object({
  sessionId: z.string(),
  state: z.enum(["WAITING_FOR_USER", "READY_FOR_CONFIRMATION", "DONE", "PARTIAL_FAILURE"]),
  messages: z.array(AgentMessageSchema),
  plan: PlanSchema.optional(),
  toolTraces: z.array(ToolCallTraceSchema),
  needsUserInput: z
    .object({
      question: z.string(),
      options: z.array(z.string()).optional()
    })
    .optional(),
  executionReceipts: z.array(ExecutionReceiptSchema).default([])
});
export type AgentRunOutput = z.infer<typeof AgentRunOutputSchema>;

export const AgentRunStateSchema = z.enum(["WAITING_FOR_USER", "READY_FOR_CONFIRMATION", "DONE", "PARTIAL_FAILURE"]);
export type AgentRunState = z.infer<typeof AgentRunStateSchema>;

const AgentStreamEventBaseSchema = z.object({
  runId: z.string(),
  threadId: z.string(),
  timestamp: z.string()
});

export const AgentStepPhaseSchema = z.enum([
  "intent",
  "planning",
  "tooling",
  "verification",
  "repair",
  "confirmation",
  "execution",
  "final"
]);
export type AgentStepPhase = z.infer<typeof AgentStepPhaseSchema>;

export const AgentStepStatusSchema = z.enum(["running", "succeeded", "failed", "skipped"]);
export type AgentStepStatus = z.infer<typeof AgentStepStatusSchema>;

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  AgentStreamEventBaseSchema.extend({
    type: z.literal("thread.created"),
    title: z.string().optional()
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("message.delta"),
    messageId: z.string(),
    role: z.enum(["assistant", "user"]),
    delta: z.string()
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("message.completed"),
    messageId: z.string(),
    role: z.enum(["assistant", "user"])
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("agent.step"),
    phase: AgentStepPhaseSchema,
    title: z.string(),
    status: AgentStepStatusSchema,
    detail: z.string().optional()
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("tool.started"),
    toolCallId: z.string(),
    toolName: z.string(),
    inputSummary: z.string()
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("tool.finished"),
    toolCallId: z.string(),
    toolName: z.string(),
    status: z.enum(["succeeded", "failed"]),
    outputSummary: z.string().optional(),
    error: ToolErrorSchema.optional()
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("plan.updated"),
    plan: PlanSchema
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("confirmation.required"),
    planId: z.string(),
    summary: z.string(),
    actions: z.array(PlanActionSchema)
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("execution.receipt"),
    receipt: ExecutionReceiptSchema
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("run.completed"),
    state: AgentRunStateSchema
  }),
  AgentStreamEventBaseSchema.extend({
    type: z.literal("run.failed"),
    error: ToolErrorSchema,
    retryable: z.boolean()
  })
]);
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export type Activity = {
  id: string;
  name: string;
  type: "playground" | "workshop" | "exhibition" | "citywalk" | "tabletop" | "free_walk";
  address: string;
  location: Location;
  tags: string[];
  priceCny: number;
  durationMinutes: number;
  openHours: { start: string; end: string };
  capacity: Record<string, number>;
};

export type Restaurant = {
  id: string;
  name: string;
  address: string;
  location: Location;
  tags: string[];
  averagePriceCny: number;
  atmosphere: string[];
  availability: Record<string, number[]>;
  queueMinutes: Record<string, number>;
};

export type Product = {
  id: string;
  name: string;
  type: "cake" | "flowers" | "gift";
  priceCny: number;
  tags: string[];
  deliveryWindows: string[];
};
