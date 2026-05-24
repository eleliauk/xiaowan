## ADDED Requirements

### Requirement: Provide a single-screen demo workbench
The system SHALL provide a Next.js web page that exposes chat input, plan timeline, tool trace, and execution controls on the first screen.

#### Scenario: User enters a planning goal
- **GIVEN** the demo workbench is open
- **WHEN** the user submits a natural-language outing request
- **THEN** the page calls `/api/plan` and displays planning progress or results without navigating away

#### Scenario: Demo shortcuts are available
- **GIVEN** the demo workbench is open
- **WHEN** the user wants to run a prepared scenario
- **THEN** the page provides shortcuts for the family afternoon scenario and the four-friend afternoon scenario

### Requirement: Display executable plan timeline
The system SHALL display the selected plan as an ordered timeline with times, places, activity types, notes, and required actions.

#### Scenario: Timeline renders a family plan
- **GIVEN** `/api/plan` returns a family plan
- **WHEN** the UI renders the response
- **THEN** the timeline shows departure, activity, meal, optional add-on, and return or wrap-up steps

#### Scenario: Timeline exposes risks
- **GIVEN** the selected plan includes residual risks
- **WHEN** the timeline is displayed
- **THEN** the risks are visible near the relevant step or plan summary

### Requirement: Display tool trace panel
The system SHALL display tool calls with status, tool name, compact input summary, compact output summary, and error information.

#### Scenario: Successful tool call is visible
- **GIVEN** a planning run checked restaurant availability
- **WHEN** the tool trace panel renders
- **THEN** it shows the availability tool as succeeded with the checked restaurant and time

#### Scenario: Failed tool call is visible
- **GIVEN** a planning run encountered no availability for the first restaurant
- **WHEN** the tool trace panel renders
- **THEN** it shows the failed or recoverable tool call and the fallback that was attempted

### Requirement: Confirm before executing actions
The system SHALL require the user to click a confirmation control before executing bookings, reservations, delivery scheduling, or message sending.

#### Scenario: Confirmation starts execution
- **GIVEN** a plan is in `READY_FOR_CONFIRMATION`
- **WHEN** the user clicks confirm and arrange
- **THEN** the page calls `/api/execute` with the session and plan identifiers

#### Scenario: Execution controls disabled before plan readiness
- **GIVEN** a plan is still loading or waiting for clarification
- **WHEN** the execution panel renders
- **THEN** the confirm and arrange control is disabled

### Requirement: Display execution receipts and final share message
The system SHALL display execution receipts and a final message that can be sent to a spouse or friend after confirmed actions complete.

#### Scenario: Receipts render after execution
- **GIVEN** `/api/execute` returns successful reservation and booking receipts
- **WHEN** the UI renders execution results
- **THEN** each receipt is shown with identifier, target place or contact, time, and status

#### Scenario: Final message summarizes the plan
- **GIVEN** execution has completed or partially completed
- **WHEN** the final message is shown
- **THEN** it includes departure time, first activity, meal plan, and any important reservation status
