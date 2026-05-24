## ADDED Requirements

### Requirement: Use explicit LangGraph planning flow
The system SHALL implement planning as an explicit LangGraph.js StateGraph with named nodes and conditional edges.

#### Scenario: Planning graph reaches confirmation
- **GIVEN** a complete user goal and available mock data
- **WHEN** `/api/plan` invokes the planning graph
- **THEN** the graph runs parse, candidate generation, tool lookup, composition, verification, and confirmation nodes before returning `READY_FOR_CONFIRMATION`

#### Scenario: Planning graph stops for missing information
- **GIVEN** a user goal that lacks required scenario or timing information
- **WHEN** the planning graph parses the message
- **THEN** it returns `WAITING_FOR_USER` with one concise clarification question

### Requirement: Separate planning from execution
The system SHALL prevent reservation, booking, delivery, and message-send actions from running before user confirmation.

#### Scenario: Planning does not execute actions
- **GIVEN** `/api/plan` receives a valid user goal
- **WHEN** the planning graph completes
- **THEN** required actions are returned with `pending` status and no execution receipt

#### Scenario: Execution requires a confirmed plan
- **GIVEN** `/api/execute` is called without a confirmed plan identifier
- **WHEN** the execution graph validates the request
- **THEN** it rejects execution and does not call action tools

### Requirement: Verify plans before confirmation
The system SHALL verify candidate plans for availability, queue time, opening hours, duration, distance, and scenario constraints before presenting them as executable.

#### Scenario: Invalid plan triggers repair
- **GIVEN** the selected restaurant has no table at the proposed meal time
- **WHEN** `verifyPlan` evaluates the selected plan
- **THEN** the graph routes to `repairPlan` rather than returning the plan unchanged

#### Scenario: Valid plan reaches confirmation
- **GIVEN** the selected plan satisfies blocking checks and has sufficient confidence
- **WHEN** `verifyPlan` completes
- **THEN** the graph routes to `waitForConfirmation`

### Requirement: Repair failed plans with bounded retries
The system SHALL attempt bounded repairs for recoverable planning failures and expose residual risks when repair is exhausted.

#### Scenario: Restaurant fallback succeeds
- **GIVEN** the first restaurant has no 4-person table at 18:00 but an alternative has availability
- **WHEN** `repairPlan` runs
- **THEN** it updates the plan to the alternative restaurant or adjusted time and records the change in plan risks or notes

#### Scenario: Repair limit is reached
- **GIVEN** repeated repairs cannot find a fully valid plan
- **WHEN** the repair count reaches the configured limit
- **THEN** the graph returns the best available plan with explicit blocking risks rather than looping indefinitely

### Requirement: Preserve tool and node traceability
The system SHALL preserve trace records for graph node transitions and tool calls so the UI can explain how the plan was produced.

#### Scenario: Tool calls are visible
- **GIVEN** the planner checks activities, restaurants, queue time, and availability
- **WHEN** `/api/plan` returns
- **THEN** the response includes trace entries with tool name, input, output or error, status, and timestamps
