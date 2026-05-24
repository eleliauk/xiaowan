## Context

DeerFlow's useful lesson is not "copy the whole stack." The useful lesson is boundary clarity:

```text
Thread state
  owns conversation and durable artifacts

Run
  owns one active unit of work

Agent graph or runner
  owns model turns, tool calls, safety gates, and state writes

Stream bridge
  decouples producers from SSE consumers

Gateway route
  validates input and streams output
```

The MVP now uses this shape directly. The earlier `runPlanning()` / `executePlan()` / LangGraph wrapper path has been removed from `@mh/agent` and the legacy `/api/plan` and `/api/execute` routes have been deleted.

## Current Runtime Shape

```text
Browser
  │
  ▼
POST /api/chat
  │
  ├─ validate body
  ├─ create/resume thread
  ├─ create/reuse run
  └─ return SSE consumer from StreamBridge.subscribe(runId)

Runtime producer
  │
  ▼
LocalActivityRuntime.startTurn()
  ├─ ThreadStore appends user message and applies stream events
  ├─ RunManager tracks status, idempotency, and abort
  ├─ LocalActivityAgent.streamTurn()
  │    ├─ runReActPlanning() for planning/tool use/fallback
  │    └─ executeActions() only for confirmed pending actions
  └─ StreamBridge.publish(runId, event)
```

## Runtime Shape Target

```text
Browser
  │
  ▼
POST /api/chat
  │
  ├─ validate body
  ├─ create/resume thread
  ├─ start run
  └─ return SSE consumer
          │
          ▼
      StreamBridge.subscribe(runId)


Runtime producer
  │
  ▼
RunManager.start(threadId, userTurn)
  │
  ├─ create RunRecord
  ├─ install abort signal and idempotency key
  ├─ call LocalActivityAgent.streamTurn()
  └─ persist terminal state
          │
          ▼
      StreamBridge.publish(runId, event)
```

The runtime uses one agent loop with explicit event hooks:

```text
LocalActivityAgent.streamTurn()
  -> publish agent.step
  -> model turn
  -> publish tool.started
  -> call registry tool
  -> publish tool.finished
  -> repeat
  -> publish plan.updated
  -> publish confirmation.required
```

Decision for this change: keep the instrumented ReAct loop for the MVP and remove the unused LangGraph wrapper. Runtime boundaries are made explicit with `agent.step`, `tool.started`, `tool.finished`, `plan.updated`, `confirmation.required`, `execution.receipt`, and terminal run events.

## Runtime Components

| Component | Owns | Does not own |
| --- | --- | --- |
| `POST /api/chat` route | Request validation, SSE response, client disconnect wiring | Planning, execution, state reconstruction |
| `ThreadStore` | Messages, pending plan, receipts, latest status, event history pointer | Tool execution logic |
| `RunManager` | Run creation, status, idempotency, abort, terminal persistence | UI rendering |
| `StreamBridge` | Ordered event publication and subscription | Business state decisions |
| `LocalActivityAgent` | Model loop, tool calls, plan safety, confirmation, execution | HTTP response mechanics |
| `ToolRegistry` | Typed tool validation and handlers | Conversation state |

## Minimal Interfaces

These are conceptual contracts, not required exact names:

```ts
type ChatTurnInput = {
  threadId?: string;
  message: string;
  clientRunId?: string;
  now: string;
  abortSignal?: AbortSignal;
};

type RunRecord = {
  runId: string;
  threadId: string;
  clientRunId?: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

type StreamBridge = {
  publish(runId: string, event: AgentStreamEvent): Promise<void>;
  publishEnd(runId: string): Promise<void>;
  subscribe(runId: string, options?: { lastEventId?: string }): AsyncIterable<AgentStreamEvent>;
};

type ThreadState = {
  threadId: string;
  messages: AgentMessage[];
  status: AgentRunState;
  pendingConfirmation?: ConfirmationRequest;
  plan?: Plan;
  receipts: ExecutionReceipt[];
  events: AgentStreamEvent[];
};
```

## Event Timing

Events should be emitted at the boundary they describe:

- `thread.created`: after a thread id is allocated.
- `message.delta`: while assistant content is produced, or as soon as a full assistant message is available.
- `agent.step`: when the runtime enters or finishes meaningful phases.
- `tool.started`: immediately before invoking a registry tool.
- `tool.finished`: immediately after the tool returns or fails.
- `plan.updated`: after schema and safety validation.
- `confirmation.required`: after a pending confirmation is written to thread state.
- `execution.receipt`: immediately after an execution tool returns a receipt.
- `run.completed`: after terminal thread state is persisted.
- `run.failed`: after a normalized failure is known.

## Confirmation Model

Confirmation is state, not a string regex.

```text
Thread status: READY_FOR_CONFIRMATION
  pendingConfirmation:
    planId
    actions
    revisionAllowed
    expiresAt?

Next user turn:
  ├─ confirms pending plan -> execute actions
  ├─ asks to revise       -> clear pending execution, replan
  └─ unrelated message    -> answer or ask clarification without executing
```

Natural language still matters. The model or a small classifier may interpret whether the turn is confirmation or revision, but execution requires a matching pending confirmation state.

## Tool and Safety Boundary

The existing `@mh/tools` registry remains the only mock-data boundary. The runtime must continue to enforce:

- Planning exposes only discovery and availability tools.
- Execution tools run only after pending confirmation is accepted.
- Tool input and output are schema-validated.
- Recoverable tool failures become model observations.
- Non-recoverable tool failures produce `run.failed`.
- Receipts are created only from execution tool outputs.
- Model-provided receipts or succeeded action statuses are rejected before confirmation.

## Legacy Route Strategy

`/api/plan` and `/api/execute` have been removed from the product architecture.

```text
Frontend orchestration endpoints:
  POST /api/chat
```

## Migration Path

1. Introduce runtime service interfaces without changing UI behavior.
2. Move session Map behavior behind `ThreadStore`.
3. Add `RunManager` and `StreamBridge` with in-memory implementations.
4. Rewrite `runChatTurn` so streaming is the primary execution path.
5. Emit tool and step events during the ReAct loop.
6. Replace regex confirmation with pending confirmation state.
7. Slim `/api/chat` down to request validation plus SSE subscription.
8. Remove legacy plan/execute routes.
9. Update old architecture docs that described `/api/plan` and explicit planning graph as the primary path.

## Risks

- Overfitting to DeerFlow could add too much platform machinery. Keep the MVP in-memory and TypeScript-only.
- Reworking streaming may destabilize the demo. Preserve event names and UI rendering contracts.
- Confirmation classification can be ambiguous. Require both interpreted intent and matching pending state before executing.
- Idempotency can be skipped under hackathon pressure. It is required for execution turns because duplicate confirmations can create duplicate receipts.

## Open Questions

- Should the in-memory `StreamBridge` retain all events for a thread, or only per-run events plus a thread snapshot?
- Should `/api/chat` support `Last-Event-ID` in the MVP, or only after a durable store exists?
- Should the agent runner stay as a hand-written ReAct loop with event hooks, or be converted back into explicit graph nodes once the boundary is clean?
