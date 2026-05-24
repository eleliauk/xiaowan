## ADDED Requirements

### Requirement: Provide typed tool registry
The system SHALL define all business tools through a TypeScript registry with name, description, input schema, output schema, and handler.

#### Scenario: Tool input is validated
- **GIVEN** a graph node calls a registered tool
- **WHEN** the input does not match the tool schema
- **THEN** the tool call fails with a normalized validation error and no mock state is changed

#### Scenario: Tool output is validated
- **GIVEN** a tool handler returns data
- **WHEN** the output does not match the tool output schema
- **THEN** the tool call fails with a normalized tool error

### Requirement: Expose LangChain tool wrappers
The system SHALL wrap registered business tools as LangChain JS `tool()` instances for use inside LangGraph nodes.

#### Scenario: Registry tool becomes LangChain tool
- **GIVEN** a registered `searchRestaurants` business tool
- **WHEN** the tool wrapper is created
- **THEN** the LangChain tool preserves the registry name, description, input schema, and handler behavior

### Requirement: Support discovery tools
The system SHALL provide mock tools for user profile, travel estimation, nearby activities, restaurants, add-on products, queue time, and availability.

#### Scenario: Activity discovery returns suitable candidates
- **GIVEN** a family goal near the user's home
- **WHEN** `searchNearbyActivities` runs
- **THEN** it returns activities tagged as nearby and child-friendly when such activities exist

#### Scenario: Restaurant discovery respects dietary constraints
- **GIVEN** a family goal where the wife is losing weight
- **WHEN** `searchRestaurants` runs
- **THEN** it prioritizes restaurants with healthy, light, low-fat, or customizable menu tags

### Requirement: Support execution tools
The system SHALL provide mock execution tools for activity booking, restaurant reservation, delivery scheduling, and message sending.

#### Scenario: Restaurant reservation returns receipt
- **GIVEN** the user confirms a plan with an available restaurant action
- **WHEN** `reserveRestaurant` succeeds
- **THEN** the action status becomes `succeeded` and contains a receipt with reservation identifier, place, time, party size, and status

#### Scenario: Message send returns status
- **GIVEN** the user confirms sending the final plan to a contact
- **WHEN** `sendMessage` succeeds
- **THEN** the action status becomes `succeeded` and contains a message receipt

### Requirement: Normalize tool errors
The system SHALL convert tool failures into standard error codes with recoverability information and optional fallback guidance.

#### Scenario: No restaurant availability is recoverable
- **GIVEN** `checkRestaurantAvailability` finds no table at the requested time
- **WHEN** the tool returns an error
- **THEN** the error code is `NO_AVAILABILITY`, recoverable is true, and fallback guidance is provided

#### Scenario: Delivery unavailable can skip optional add-on
- **GIVEN** `scheduleDelivery` cannot deliver to the restaurant before the target time
- **WHEN** the execution graph handles the error
- **THEN** the graph marks the optional delivery action as failed or skipped without failing the required restaurant reservation

### Requirement: Never let LLM fabricate execution results
The system SHALL only create execution receipts from tool handler outputs.

#### Scenario: LLM text does not create receipt
- **GIVEN** the model says a booking was successful
- **WHEN** no execution tool has returned a receipt
- **THEN** the system does not mark the action as succeeded and does not display a booking identifier
