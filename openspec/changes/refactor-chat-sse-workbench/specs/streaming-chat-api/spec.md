## ADDED Requirements

### Requirement: Expose a single streaming chat endpoint
The system SHALL expose one frontend-facing chat endpoint that accepts user turns and returns an SSE stream for planning, confirmation, and execution.

#### Scenario: New thread starts through chat
- **GIVEN** the user submits a message without a thread identifier
- **WHEN** the frontend posts to `/api/chat`
- **THEN** the response streams a `thread.created` event followed by run events for the new thread

#### Scenario: Existing thread continues through chat
- **GIVEN** the user submits a message with an existing thread identifier
- **WHEN** the frontend posts to `/api/chat`
- **THEN** the response streams events attached to that existing thread

#### Scenario: Confirmation uses the same endpoint
- **GIVEN** a thread is waiting for user confirmation
- **WHEN** the user submits a confirmation message to `/api/chat`
- **THEN** the agent resumes execution and streams tool and receipt events without the frontend calling `/api/execute`

### Requirement: Return valid Server-Sent Events
The system SHALL encode each agent event as a valid SSE frame with a stable event name and JSON data payload.

#### Scenario: Event frame is parseable
- **GIVEN** the agent yields a typed stream event
- **WHEN** the API writes it to the response
- **THEN** the frame contains an `event:` line, a `data:` line with JSON, and a blank line terminator

#### Scenario: Stream closes on completion
- **GIVEN** the agent run reaches a terminal state
- **WHEN** the final event is sent
- **THEN** the API emits `run.completed` or `run.failed` before closing the stream

### Requirement: Keep orchestration on the server
The system SHALL prevent the React UI from directly coordinating plan and execute phases.

#### Scenario: UI submits only chat turns
- **GIVEN** the user asks for an afternoon arrangement
- **WHEN** the UI handles the request
- **THEN** it sends the request to `/api/chat` and does not call `/api/plan`

#### Scenario: UI confirms only through chat
- **GIVEN** a plan is ready for confirmation
- **WHEN** the user confirms it
- **THEN** the UI submits a confirmation message to `/api/chat` and does not call `/api/execute`

### Requirement: Handle cancellation and duplicate submission safely
The system SHALL handle aborted streams and duplicate client run identifiers without corrupting thread state or double-executing confirmed actions.

#### Scenario: Client aborts planning stream
- **GIVEN** the frontend aborts a stream before confirmation
- **WHEN** the server receives the abort signal
- **THEN** the server cancels remaining unconfirmed planning work and leaves the thread in a recoverable state

#### Scenario: Duplicate run id is submitted
- **GIVEN** a request repeats a previously accepted `clientRunId`
- **WHEN** `/api/chat` receives the duplicate request
- **THEN** the system reuses or replays the existing run state instead of executing actions twice

### Requirement: Surface normalized API errors as stream events
The system SHALL prefer structured failure events over opaque HTTP failures after streaming begins.

#### Scenario: Tool failure occurs after stream start
- **GIVEN** a tool fails while the SSE response is already open
- **WHEN** the failure cannot be repaired
- **THEN** the API emits `run.failed` with a normalized error code and human-readable message

#### Scenario: Invalid request is rejected before stream start
- **GIVEN** `/api/chat` receives an invalid request body
- **WHEN** validation fails before any event is written
- **THEN** the API returns a non-2xx JSON validation error response
