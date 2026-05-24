## 1. Runtime Boundary Cleanup

- [x] 1.1 Inventory current `@mh/agent`, `/api/chat`, `/api/plan`, `/api/execute`, and session-store responsibilities.
- [x] 1.2 Define runtime service contracts for `ThreadStore`, `RunManager`, `StreamBridge`, and `LocalActivityAgent`.
- [x] 1.3 Move session Map behavior behind `ThreadStore` without changing user-visible chat behavior.
- [x] 1.4 Add an in-memory `RunManager` that tracks run id, thread id, client run id, status, abort signal, and terminal error.
- [x] 1.5 Add an in-memory `StreamBridge` that supports publish, subscribe, terminal close, and deterministic event ordering.

## 2. Stream-First Agent Runner

- [x] 2.1 Refactor `runChatTurn` so it streams events while work happens instead of awaiting `runPlanning()` and replaying events.
- [x] 2.2 Emit `agent.step` events at real runtime boundaries for planning, tool use, verification, confirmation, execution, and finalization.
- [x] 2.3 Emit `tool.started` immediately before registry invocation and `tool.finished` immediately after success or failure.
- [x] 2.4 Preserve native provider tool calling and recoverable observation handling from `runReActPlanning`.
- [x] 2.5 Decide whether to keep the ReAct loop as an instrumented runner or split it into explicit LangGraph nodes, then document the choice.
- [x] 2.6 Add ReAct duplicate-tool guardrails and loop-limit fallback plan composition from successful observations.

## 3. Confirmation and Execution Safety

- [x] 3.1 Store pending confirmation state on the thread when `confirmation.required` is emitted.
- [x] 3.2 Replace regex-only confirmation detection with pending-state plus interpreted intent.
- [x] 3.3 Support revision turns from `READY_FOR_CONFIRMATION` without executing stale actions.
- [x] 3.4 Enforce execution idempotency for duplicate `clientRunId` and duplicate confirmed actions.
- [x] 3.5 Ensure receipts are created only from execution tool outputs and are attached to the corresponding action.

## 4. Chat API Simplification

- [x] 4.1 Slim `/api/chat` so it validates the request, starts or resumes a thread, starts a run, and returns an SSE subscription.
- [x] 4.2 Wire client disconnects to run cancellation for unconfirmed planning work.
- [x] 4.3 Emit structured `run.failed` before stream close when runtime errors happen after streaming starts.
- [x] 4.4 Keep invalid request failures as pre-stream JSON errors.
- [x] 4.5 Add tests that prove the route no longer reconstructs session state by replaying events in the handler.

## 5. Legacy and Documentation Cleanup

- [x] 5.1 Remove `/api/plan` and `/api/execute` after `/api/chat` parity tests pass.
- [x] 5.2 Delete or quarantine unused old planning nodes once the stream-first runtime covers their behavior.
- [x] 5.3 Update `docs/mvp-agent-loop-architecture.md` so it no longer presents `/api/plan`, `/api/execute`, or the old explicit planning graph as the primary architecture.
- [x] 5.4 Update OpenSpec tasks in related changes to point at this runtime boundary where they conflict.

## 6. Verification

- [x] 6.1 Add unit tests for `ThreadStore`, `RunManager`, and `StreamBridge`.
- [x] 6.2 Add agent tests proving tool events are emitted during actual registry invocation.
- [x] 6.3 Add confirmation tests for confirm, revise, duplicate confirmation, and unrelated follow-up turns.
- [ ] 6.4 Add `/api/chat` SSE tests for cancellation, failure, and terminal event ordering.
- [x] 6.5 Run `pnpm test`, `pnpm check`, and `openspec validate align-agent-runtime-with-deerflow`.
- [x] 6.6 Add runtime and stream tests for skipped tool calls, loop-limit fallback, cancellation terminal events, and display metadata.
- [x] 6.7 Add ordering coverage for `plan.updated -> artifact.updated -> confirmation.required -> run.completed` and final artifact updates after receipts.
