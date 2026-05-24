## ADDED Requirements

### Requirement: Define a typed agent stream event envelope
The system SHALL define a shared discriminated `AgentStreamEvent` type for all events emitted by the agent and consumed by the UI.

#### Scenario: Event includes required envelope fields
- **GIVEN** the agent emits any stream event
- **WHEN** the event is validated
- **THEN** it includes `type`, `runId`, `threadId`, and an ISO timestamp

#### Scenario: Unknown event type is rejected
- **GIVEN** an event payload contains an unsupported `type`
- **WHEN** the shared schema parses it
- **THEN** validation fails with a useful schema error

### Requirement: Represent assistant text as streamable message events
The system SHALL represent assistant output through message creation, delta, and completion events so the UI can render streaming text.

#### Scenario: Assistant message streams incrementally
- **GIVEN** the agent is composing a response
- **WHEN** text tokens are available
- **THEN** it emits `message.delta` events with message id, role, and delta content

#### Scenario: Assistant message completes
- **GIVEN** the assistant response has finished
- **WHEN** no more text deltas remain for that message
- **THEN** the agent emits `message.completed` with the final message id

### Requirement: Represent planning and tool progress
The system SHALL emit structured events for high-level agent steps and individual tool calls.

#### Scenario: Planning step starts or updates
- **GIVEN** the agent enters intent parsing, candidate generation, verification, repair, confirmation, or execution
- **WHEN** the phase changes state
- **THEN** it emits `agent.step` with phase, title, status, and optional detail

#### Scenario: Tool call starts
- **GIVEN** the agent invokes a typed tool
- **WHEN** the call begins
- **THEN** it emits `tool.started` with tool call id, tool name, and compact input summary

#### Scenario: Tool call finishes
- **GIVEN** a tool call returns or fails
- **WHEN** the result is available
- **THEN** it emits `tool.finished` with tool call id, status, compact output summary, and normalized error when applicable

#### Scenario: Tool event includes display metadata
- **GIVEN** the agent emits `agent.step`, `tool.started`, or `tool.finished`
- **WHEN** the UI validates the event
- **THEN** the event may include `display.title`, `display.summary`, `display.items`, `display.severity`, and `display.artifactRef` for user-facing rendering

#### Scenario: Duplicate tool call is skipped
- **GIVEN** the ReAct loop requests an exact duplicate planning tool call in the same run
- **WHEN** the runtime guardrail detects the duplicate
- **THEN** it emits `tool.finished` with `status: "skipped"` and display metadata explaining the skipped query

### Requirement: Represent itinerary artifacts and confirmation state
The system SHALL emit structured plan and confirmation events that let the UI render executable local-activity arrangements inside chat.

#### Scenario: Plan update is emitted
- **GIVEN** the agent has composed or repaired an itinerary
- **WHEN** the current plan changes
- **THEN** it emits `plan.updated` with plan id, title, summary, timeline, risks, and required actions

#### Scenario: Markdown artifact is emitted after plan update
- **GIVEN** the agent has emitted `plan.updated`
- **WHEN** a user-facing plan document can be rendered from the structured plan
- **THEN** it emits `artifact.updated` with a markdown artifact containing title, overview, timeline, suitability reasons, pending actions, and risks

#### Scenario: Markdown artifact is updated after execution
- **GIVEN** a confirmed plan has produced execution receipts
- **WHEN** receipt events have been emitted
- **THEN** it emits `artifact.updated` for the same artifact with `status: "final"` and an execution receipts section

#### Scenario: Confirmation is required
- **GIVEN** the plan is ready but bookings, reservations, delivery, or messages have not been executed
- **WHEN** the agent needs user approval
- **THEN** it emits `confirmation.required` with plan id, summary, and action list

#### Scenario: User asks for revisions
- **GIVEN** a thread is waiting for confirmation
- **WHEN** the user requests a change instead of confirming
- **THEN** the next chat run emits revised planning and plan update events without executing previous actions

### Requirement: Represent execution receipts and terminal run state
The system SHALL emit execution receipts and terminal run events that make completed actions auditable in the conversation.

#### Scenario: Booking receipt is emitted
- **GIVEN** a confirmed activity booking, restaurant reservation, delivery schedule, or message send succeeds
- **WHEN** the execution tool returns
- **THEN** the agent emits `execution.receipt` with receipt id, action id, target name, status, scheduled time, and display details

#### Scenario: Run completes
- **GIVEN** the agent reaches a terminal non-error state
- **WHEN** all required events for the run have been emitted
- **THEN** it emits `run.completed` with final state such as `READY_FOR_CONFIRMATION`, `DONE`, or `PARTIAL_FAILURE`

#### Scenario: Run fails
- **GIVEN** the agent cannot recover from a validation, tool, or runtime error
- **WHEN** the failure is known
- **THEN** it emits `run.failed` with normalized error code, message, and retryability

#### Scenario: Loop limit produces fallback artifact when facts exist
- **GIVEN** the ReAct loop reaches the maximum number of tool-calling turns after successful observations
- **WHEN** the runtime can compose a partial local-activity plan from those observations
- **THEN** it emits `plan.updated`, `confirmation.required`, and `run.completed` instead of only emitting `run.failed`
