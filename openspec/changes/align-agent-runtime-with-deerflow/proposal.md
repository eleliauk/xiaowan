## Why

The current agent architecture has drifted across three valid but conflicting ideas:

- The original MVP wanted an explicit business `StateGraph` with parse, tool, verify, repair, confirmation, and execution nodes.
- The live LLM change moved planning into one ReAct-style native tool-calling loop.
- The workspace refactor moved the product toward a DeerFlow-style single chat stream.

That leaves the code feeling odd: the UI calls one chat endpoint, but the backend still keeps legacy plan and execute routes; the graph looks small, but the real loop is hidden inside one node; the SSE stream is typed, but many events are replayed after a blocking planning run instead of emitted while work happens.

This change defines a DeerFlow-lite runtime boundary for the Meituan demo. It copies DeerFlow's useful shape: thread, run, stream bridge, thin gateway, and server-owned orchestration. It does not copy DeerFlow's full platform complexity such as Python gateway services, sandbox lifecycle, MCP management, memory extraction, subagents, or persistent multi-user infrastructure.

## What Changes

- Introduce clear runtime ownership:
  - `Thread` stores conversation and pending confirmation state.
  - `Run` represents one user turn or execution continuation.
  - `StreamBridge` publishes run events as they happen.
  - The chat API subscribes to the run stream and writes SSE frames.
- Refactor `@mh/agent` toward a stream-first runner:
  - The runner emits `AgentStreamEvent` values while planning, tool calls, repairs, confirmation, and execution happen.
  - It must not wait for a full `AgentRunOutput` and then replay derived events as the main streaming path.
- Make the Next.js route handler thin:
  - Validate request.
  - Create or resume a thread.
  - Start a run.
  - Return an SSE consumer.
  - Leave orchestration, persistence, idempotency, cancellation, and execution safety to runtime services.
- Replace regex-based confirmation with thread state:
  - A thread waiting for confirmation stores the pending plan and allowed actions.
  - A confirmation turn resumes that pending state.
  - A revision turn replans without executing old actions.
- Retire the old architectural story:
  - `/api/chat` remains the frontend orchestration endpoint.
  - `/api/plan` and `/api/execute` become temporary legacy compatibility only, then are removed or hidden from the UI.
  - Old unused planning nodes are deleted or quarantined after the stream-first runtime covers their behavior.

## Capabilities

### New Capabilities

- `agent-runtime-boundary`: Defines the DeerFlow-lite runtime boundary, agent runner responsibilities, and API route responsibilities.
- `thread-run-streaming`: Defines thread/run identity, stream bridge behavior, event ordering, replay, cancellation, and storage expectations.
- `confirmation-execution-safety`: Defines confirmation state, revision behavior, idempotent execution, and receipt safety.

### Related Existing Capabilities

- `streaming-chat-api`: The public API remains `/api/chat`, but its implementation should become run/stream driven.
- `agent-event-protocol`: Event shapes remain the frontend contract; this change strengthens when and why events are emitted.
- `llm-provider-integration`: Native tool calling remains the planning mechanism; this change relocates it behind a cleaner runtime boundary.
- `agent-orchestration`: Superseded where it still describes the old explicit planning graph as the main runtime shape.

## Non-Goals

- Do not integrate real Meituan APIs.
- Do not add full DeerFlow sandbox, MCP, memory, subagent, auth, or multi-tenant infrastructure.
- Do not expose raw model reasoning.
- Do not require durable storage beyond an in-memory MVP interface, but design the interfaces so SQLite or LangGraph checkpoints can be added later.
- Do not reintroduce frontend-owned plan and execute orchestration.

## User Impact

The user still experiences one quiet chat workspace. The difference is architectural: streamed steps, tool calls, plan updates, confirmation prompts, execution receipts, errors, cancellation, and retry all come from one server-owned run pipeline. The demo becomes easier to reason about because the UI renders agent state instead of coordinating agent phases.

## Success Criteria

- A new user message creates or resumes a thread, starts a run, and streams events as work happens.
- Tool events are emitted at actual tool invocation boundaries.
- Confirmation execution is driven by pending thread state, not text matching alone.
- Duplicate run submissions do not double-book mock actions.
- Aborted planning runs leave the thread recoverable.
- Legacy plan/execute code no longer defines the primary architecture.
