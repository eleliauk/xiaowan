## ADDED Requirements

### Requirement: Separate API routing from agent runtime orchestration
The system SHALL keep frontend route handlers thin and SHALL place planning, tool execution, confirmation, state mutation, idempotency, and cancellation logic in the agent runtime layer.

#### Scenario: Chat route starts a run without owning orchestration
- **GIVEN** the frontend posts a valid user turn to `/api/chat`
- **WHEN** the route handles the request
- **THEN** it validates the body, creates or resumes a thread, starts a run, and returns an SSE response without directly coordinating planning or execution phases

#### Scenario: Runtime owns state transitions
- **GIVEN** an agent run updates messages, plans, pending confirmation, receipts, or terminal status
- **WHEN** the update is produced
- **THEN** the runtime writes the state through the thread/run storage boundary rather than reconstructing authoritative state inside the route handler

### Requirement: Provide a stream-first agent runner
The system SHALL expose a chat-turn runner whose primary output is an `AsyncIterable<AgentStreamEvent>` emitted while the run is executing.

#### Scenario: Planning events are emitted during planning
- **GIVEN** the model is still selecting tools or composing a plan
- **WHEN** a meaningful planning step or tool call occurs
- **THEN** the runner emits the corresponding stream event before the full planning result is complete

#### Scenario: Completed output is not the primary streaming source
- **GIVEN** a chat turn requires planning and tool calls
- **WHEN** the runner executes the turn
- **THEN** it does not wait for a complete `AgentRunOutput` and then replay derived tool, plan, and confirmation events as the main streaming mechanism

### Requirement: Make graph boundaries match runtime behavior
The system SHALL ensure LangGraph nodes or explicit runner phases describe real runtime boundaries that can be traced and streamed.

#### Scenario: Explicit graph nodes are used
- **GIVEN** the runtime represents planning as multiple graph nodes
- **WHEN** the graph streams progress
- **THEN** node transitions correspond to meaningful phases such as intent interpretation, tool planning, tool execution, plan validation, confirmation, execution, or finalization

#### Scenario: Instrumented ReAct loop is used
- **GIVEN** the runtime keeps a hand-written ReAct loop for native tool calling
- **WHEN** the loop enters model turns, invokes tools, handles recoverable failures, validates final plans, or waits for confirmation
- **THEN** it emits explicit events for those boundaries so the UI and tests do not depend on a fake node-level story

#### Scenario: Runtime skips repeated tool calls
- **GIVEN** the ReAct loop requests an exact duplicate tool call or exceeds the per-tool call guardrail
- **WHEN** the runtime detects the repeat
- **THEN** it skips registry invocation, records a skipped tool trace, and emits a `tool.finished` event with `status: "skipped"`

#### Scenario: Runtime composes fallback from observations
- **GIVEN** the ReAct loop reaches the maximum native tool-calling turns
- **WHEN** successful observations contain enough local-activity facts to present a partial plan
- **THEN** the runtime emits a fallback plan and confirmation request instead of terminating with only a generic failure

### Requirement: Preserve Meituan domain boundaries
The system SHALL keep local-activity domain behavior in typed tools and agent policy, not in route handlers or UI workflow code.

#### Scenario: Tool registry remains the mock data boundary
- **GIVEN** the agent needs activity, restaurant, queue, availability, delivery, booking, reservation, or messaging data
- **WHEN** it accesses that data
- **THEN** it does so through the typed `@mh/tools` registry with schema validation

#### Scenario: UI does not coordinate business phases
- **GIVEN** the user asks for an afternoon arrangement or confirms a pending plan
- **WHEN** the UI submits the turn
- **THEN** it sends a chat message and renders stream events without calling separate plan or execute orchestration APIs

### Requirement: Retire legacy plan and execute orchestration
The system SHALL remove `/api/plan` and `/api/execute` from the product runtime after chat API parity is available.

#### Scenario: Frontend uses only chat orchestration
- **GIVEN** the chat workspace runs a family or friends demo flow
- **WHEN** the frontend submits initial planning, revision, or confirmation turns
- **THEN** it calls `/api/chat` only

#### Scenario: Legacy routes are absent from the runtime
- **GIVEN** implementation or documentation describes the primary architecture
- **WHEN** frontend orchestration endpoints are listed
- **THEN** `/api/chat` is the only product orchestration endpoint
