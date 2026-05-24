## ADDED Requirements

### Requirement: Distinguish threads from runs
The system SHALL model conversations as threads and each submitted user turn or execution continuation as a run.

#### Scenario: New chat creates thread and run
- **GIVEN** a user submits a message without a thread id
- **WHEN** `/api/chat` accepts the request
- **THEN** the runtime creates a new thread id, creates a run id for that user turn, emits `thread.created`, and attaches all subsequent events to both ids

#### Scenario: Existing chat creates a new run on the same thread
- **GIVEN** a user submits a message with an existing thread id
- **WHEN** the runtime accepts the request
- **THEN** it creates a new run id while preserving the existing thread messages, artifacts, pending confirmation, and receipts

### Requirement: Track run lifecycle
The system SHALL track run status independently from thread status.

#### Scenario: Run reaches success
- **GIVEN** a planning run reaches confirmation or an execution run completes
- **WHEN** all terminal state has been persisted
- **THEN** the run status becomes success and the stream emits `run.completed`

#### Scenario: Run fails
- **GIVEN** model output, tool execution, validation, or serialization fails unrecoverably
- **WHEN** the runtime records the failure
- **THEN** the run status becomes failed and the stream emits `run.failed` with a normalized error

#### Scenario: Run is cancelled before confirmation
- **GIVEN** the client disconnects during unconfirmed planning
- **WHEN** the runtime observes the abort signal
- **THEN** it cancels remaining work, marks the run cancelled or failed with a retryable error, and leaves the thread in a recoverable state

### Requirement: Publish events through a stream bridge
The system SHALL decouple event producers from SSE consumers with a stream bridge abstraction.

#### Scenario: Producer publishes event
- **GIVEN** the agent runtime emits an `AgentStreamEvent`
- **WHEN** the event is published
- **THEN** subscribers for that run receive the event in the same order

#### Scenario: Stream closes after terminal event
- **GIVEN** a run reaches `run.completed` or `run.failed`
- **WHEN** the terminal event has been published
- **THEN** the stream bridge signals end of stream to subscribers

#### Scenario: Late subscriber can receive retained events
- **GIVEN** a subscriber attaches after a run has already emitted events retained by the bridge
- **WHEN** it subscribes with no last event id
- **THEN** it receives retained events from the earliest available retained event

### Requirement: Preserve event ordering and identity
The system SHALL assign stable run-scoped ordering metadata to stream events so clients can render and test deterministic sequences.

#### Scenario: Tool event order is preserved
- **GIVEN** the agent invokes a registry tool
- **WHEN** the stream is consumed
- **THEN** `tool.started` for the call appears before its matching `tool.finished`

#### Scenario: Terminal event is last
- **GIVEN** a run emits a terminal event
- **WHEN** the stream is consumed until close
- **THEN** no business events appear after `run.completed` or `run.failed`

### Requirement: Keep MVP storage in-memory but interface-shaped
The system SHALL allow in-memory stores for the hackathon MVP while keeping interfaces compatible with future durable storage.

#### Scenario: Thread state is available during one server process
- **GIVEN** the MVP runs with in-memory storage
- **WHEN** the user continues an existing thread in the same process
- **THEN** the runtime can retrieve messages, pending confirmation, plan artifacts, receipts, and latest status

#### Scenario: Durable storage can replace memory later
- **GIVEN** a future implementation replaces in-memory stores with SQLite or checkpoint-backed stores
- **WHEN** runtime services call storage APIs
- **THEN** agent, route, and UI code do not need to change their ownership boundaries
