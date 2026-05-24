# DeerFlow-Lite Runtime Refactor

Date: 2026-05-24

The refactor is now applied. The project keeps DeerFlow's useful boundary model without copying the full platform stack.

## What Changed

- `/api/chat` is the only product orchestration endpoint.
- The frontend no longer calls plan/execute routes.
- `LocalActivityRuntime` owns thread/run orchestration.
- `ThreadStore`, `RunManager`, and `StreamBridge` isolate state, idempotency, cancellation, and ordered event delivery.
- `LocalActivityAgent.streamTurn()` owns model turns, tool calls, confirmation branching, and execution.
- The old LangGraph wrapper and explicit planning nodes were removed from `@mh/agent`.

## Current Runtime

```text
POST /api/chat
  -> validate request
  -> LocalActivityRuntime.startTurn()
  -> StreamBridge.subscribe(runId)

Runtime producer
  -> append user message
  -> runReActPlanning()
  -> publish agent.step and tool events during work
  -> publish plan.updated and confirmation.required
  -> executeActions() after pending confirmation
  -> publish receipts and terminal run event
```

## Guardrails Added

- Planning tools and execution tools remain separated.
- Duplicate planning tool calls are skipped instead of reinvoked.
- Tool display summaries are emitted for the UI; raw JSON is diagnostic-only.
- Loop-limit planning can produce a partial fallback plan from successful observations.
- Duplicate `clientRunId` values replay retained run events and do not duplicate receipts.
- Client aborts publish a retryable terminal failure before stream close when possible.

## What Not To Reintroduce

- Do not bring back `runPlanning()` or `executePlan()` as frontend-facing orchestration APIs.
- Do not re-add the old explicit node chain unless the runtime genuinely moves back to a graph.
- Do not expose raw tool JSON as the primary UI.
- Do not let model text create execution receipts; receipts come only from execution tool outputs.

