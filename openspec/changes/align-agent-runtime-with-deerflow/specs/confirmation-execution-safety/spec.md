## ADDED Requirements

### Requirement: Store pending confirmation in thread state
The system SHALL represent confirmation as explicit thread state containing the pending plan, allowed actions, and current confirmation status.

#### Scenario: Plan reaches confirmation
- **GIVEN** the agent validates a plan and has not executed booking, reservation, delivery, or message actions
- **WHEN** it emits `confirmation.required`
- **THEN** the thread stores a pending confirmation record for that plan and keeps required actions in `pending` status

#### Scenario: No pending confirmation exists
- **GIVEN** a thread has no pending confirmation record
- **WHEN** the user sends text that sounds like confirmation
- **THEN** the runtime does not execute actions and instead treats the message as a normal chat turn or asks a clarification

### Requirement: Interpret confirmation against pending state
The system SHALL require both user intent and matching pending confirmation state before executing actions.

#### Scenario: User confirms pending plan
- **GIVEN** a thread is `READY_FOR_CONFIRMATION` with a pending plan
- **WHEN** the user submits a turn interpreted as confirmation for that plan
- **THEN** the runtime executes only the pending plan's allowed actions

#### Scenario: User requests revision
- **GIVEN** a thread is `READY_FOR_CONFIRMATION` with a pending plan
- **WHEN** the user asks to adjust time, place, budget, participants, food constraints, or activity style
- **THEN** the runtime replans or asks a clarification and does not execute the stale pending actions

#### Scenario: User message is ambiguous
- **GIVEN** a thread is `READY_FOR_CONFIRMATION`
- **WHEN** the user response cannot be confidently interpreted as confirmation or revision
- **THEN** the runtime asks one concise clarification instead of executing actions

### Requirement: Execute confirmed actions idempotently
The system SHALL prevent duplicate confirmed turns or repeated client run identifiers from executing the same action twice.

#### Scenario: Duplicate client run id
- **GIVEN** a confirmation request with a `clientRunId` has already started or completed
- **WHEN** the same `clientRunId` is submitted again for the same thread
- **THEN** the runtime reuses or replays the existing run state and does not create duplicate receipts

#### Scenario: Action already has receipt
- **GIVEN** a confirmed plan action already has a successful receipt
- **WHEN** execution resumes or a duplicate request is processed
- **THEN** the runtime skips re-invoking that action's execution tool and preserves the existing receipt

### Requirement: Keep planning and execution tools separated
The system SHALL expose discovery and availability tools during planning and execution tools only after confirmation.

#### Scenario: Planning cannot book
- **GIVEN** the agent is planning a family or friends outing
- **WHEN** it sends tool definitions to the model
- **THEN** booking, reservation, delivery, and message-sending tools are not available as planning tool calls

#### Scenario: Execution uses only confirmed action tools
- **GIVEN** the user confirms a pending plan
- **WHEN** the runtime executes actions
- **THEN** it invokes only the tool names and inputs stored in the confirmed pending action list after validating them against the registry

### Requirement: Receipts come only from execution tool outputs
The system SHALL never create execution receipts from model text, plan JSON, assistant messages, or frontend state.

#### Scenario: Model fabricates a booking id before confirmation
- **GIVEN** the model output includes a receipt, booking id, order id, or succeeded action before execution tools run
- **WHEN** the plan is validated
- **THEN** the runtime rejects the unsafe plan and emits a normalized failure

#### Scenario: Execution tool returns receipt
- **GIVEN** an execution tool succeeds after confirmation
- **WHEN** the tool returns a schema-valid receipt
- **THEN** the runtime emits `execution.receipt`, attaches the receipt to the matching action, and persists it on the thread
