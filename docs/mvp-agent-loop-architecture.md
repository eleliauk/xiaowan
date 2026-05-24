# MVP Agent Runtime Architecture

Date: 2026-05-24

This document describes the current stream-first runtime. The earlier explicit LangGraph node chain and the legacy `/api/plan` + `/api/execute` product flow have been removed.

## Current Flow

```text
Browser
  -> POST /api/chat
  -> LocalActivityRuntime.startTurn()
  -> RunManager creates or reuses a run
  -> ThreadStore appends user state and applies events
  -> StreamBridge publishes ordered run events
  -> LocalActivityAgent.streamTurn()
       -> runReActPlanning() for planning, tool use, verification, repair, and fallback
       -> confirmation.required when actions need approval
       -> executeActions() only after pending confirmation is accepted
       -> execution.receipt and terminal run events
```

The frontend submits all planning, revision, and confirmation turns to `/api/chat`. It does not coordinate business phases.

## Runtime Boundaries

| Component | Owns |
| --- | --- |
| `POST /api/chat` | Request validation, SSE response, client disconnect wiring |
| `LocalActivityRuntime` | Thread/run orchestration, idempotency, stream publication |
| `ThreadStore` | Messages, plan artifact, pending confirmation, receipts, status, event history |
| `RunManager` | Run id, client run id reuse, status, abort, terminal error |
| `StreamBridge` | Ordered event publication, retained event replay, stream close |
| `LocalActivityAgent` | Model loop, tool calls, plan safety, confirmation/execution branching |
| `@mh/core/tools` registry | Typed mock data boundary and execution tool validation |

## Agent Runner

The agent uses an instrumented native tool-calling ReAct loop, not an explicit graph wrapper.

- Planning exposes discovery and availability tools only.
- Execution tools run only from pending confirmed actions.
- `tool.started` is emitted immediately before registry invocation.
- `tool.finished` is emitted immediately after success, failure, or skipped duplicate calls.
- Exact duplicate planning tool calls are skipped with `status: "skipped"`.
- If the loop limit is reached with usable observations, the runner composes a partial fallback plan instead of returning only a generic failure.

## Stream Events

The shared SSE protocol is the UI contract:

- `thread.created`
- `message.delta`
- `message.completed`
- `agent.step`
- `tool.started`
- `tool.finished`
- `plan.updated`
- `confirmation.required`
- `execution.receipt`
- `run.completed`
- `run.failed`

Tool and artifact events can include `display` metadata. The UI renders this metadata by default and keeps raw events behind diagnostics/debug affordances.

## Confirmation Safety

Confirmation is thread state, not a standalone endpoint:

```text
READY_FOR_CONFIRMATION thread
  -> pendingConfirmation.planId
  -> pendingConfirmation.actions

Next user turn:
  confirms -> executeActions()
  revises  -> replan without executing stale actions
  unclear  -> continue planning or ask for clarification
```

Duplicate `clientRunId` values reuse retained run events, and execution tools skip actions that already have successful receipts.

## Removed Legacy Code

The following older surfaces are intentionally gone:

- `@mh/core/agent` exports for `runPlanning()` and `executePlan()`
- LangGraph wrapper files and old explicit planning nodes
- Legacy `/api/plan` and `/api/execute` routes
- Old docs that presented plan/execute as the primary architecture
