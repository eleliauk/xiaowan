## ADDED Requirements

### Requirement: Configure server-side OpenAI-compatible LLM providers
The system SHALL configure LLM providers only from server-side environment variables and SHALL NOT commit or expose provider secrets.

#### Scenario: DeepSeek provider uses environment configuration
- **GIVEN** `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL` are set on the server
- **WHEN** the agent creates an LLM client
- **THEN** it uses the configured DeepSeek OpenAI-compatible endpoint and model without exposing the API key to the browser

#### Scenario: DeepSeek thinking settings are applied
- **GIVEN** `DEEPSEEK_THINKING=enabled` and `DEEPSEEK_REASONING_EFFORT=high`
- **WHEN** the agent sends a tool-calling chat request
- **THEN** the provider request includes the configured thinking mode and reasoning effort

#### Scenario: Auto mode prefers live credentials
- **GIVEN** `LLM_PROVIDER=auto` and `DEEPSEEK_API_KEY` is configured
- **WHEN** the agent creates an LLM client
- **THEN** it uses DeepSeek instead of the fake provider

#### Scenario: Auto mode falls back without credentials
- **GIVEN** `LLM_PROVIDER=auto` and no live provider API key is configured
- **WHEN** the agent creates an LLM client
- **THEN** it uses the fake provider for local offline demos

#### Scenario: Explicit DeepSeek mode requires credentials
- **GIVEN** `LLM_PROVIDER=deepseek` and no `DEEPSEEK_API_KEY` is configured
- **WHEN** the agent creates an LLM client
- **THEN** it returns a normalized configuration error and does not attempt a provider request

### Requirement: Use native tool calling for planning
The system SHALL run planning through provider-native tool calls instead of JSON tool-call planning.

#### Scenario: Model selects tools natively
- **GIVEN** the planning loop starts with a user outing request
- **WHEN** the model requests a tool call through the provider `tools` response
- **THEN** the agent executes that registered tool and appends the result as a tool observation

#### Scenario: Recoverable tool failures become observations
- **GIVEN** a native tool call checks a restaurant time that has no table
- **WHEN** the tool returns a recoverable `NO_AVAILABILITY` failure
- **THEN** the failure is appended as a tool observation so the model can choose another time or venue

#### Scenario: Unknown tool is rejected
- **GIVEN** the model returns a tool name not present in the planning registry allowlist
- **WHEN** the agent receives that native tool call
- **THEN** it records a failed trace, does not execute a handler, and fails the run explicitly

#### Scenario: Execution tools are not available during planning
- **GIVEN** the agent is in the planning phase
- **WHEN** it sends tool definitions to the model
- **THEN** booking, reservation, delivery, and messaging execution tools are excluded from the provider `tools` list

### Requirement: Validate final ReAct plans
The system SHALL validate the final model response before exposing a plan to the frontend.

#### Scenario: Model returns a safe final plan
- **GIVEN** the ReAct loop has collected activity, restaurant, availability, queue, and add-on observations
- **WHEN** the model returns final plan JSON with only pending actions
- **THEN** the graph parses it through `PlanSchema`, stores it as the selected plan, and emits it through `plan.updated`

#### Scenario: Model cannot fabricate execution receipts
- **GIVEN** the model output claims a booking or reservation succeeded
- **WHEN** no execution tool has returned a receipt
- **THEN** the graph rejects the plan and does not emit an execution receipt

#### Scenario: Model cannot call unsupported execution tools
- **GIVEN** the final plan contains a required action with an unsupported `toolName`
- **WHEN** the plan draft is validated
- **THEN** the graph rejects the plan and fails the run explicitly

### Requirement: Keep the chat API unchanged
The system SHALL keep `/api/chat` as the only frontend orchestration endpoint after native tool-calling integration.

#### Scenario: Frontend submits one chat turn
- **GIVEN** the user submits an outing request from the chat UI
- **WHEN** DeepSeek is enabled on the server
- **THEN** the frontend still sends one request to `/api/chat` and receives typed SSE events

#### Scenario: Tool events are streamed from the ReAct loop
- **GIVEN** the model selects tools during planning
- **WHEN** each registry tool starts and finishes
- **THEN** the SSE stream includes `tool.started` and `tool.finished` events for those actual invocations

### Requirement: Verify without live provider access
The system SHALL keep unit tests and CI independent from live provider network calls.

#### Scenario: Tests run without API key
- **GIVEN** no live provider API key is present
- **WHEN** `pnpm test` runs
- **THEN** tests use fake or mocked LLM behavior and do not call the live provider

#### Scenario: Manual smoke test uses local credentials
- **GIVEN** a developer configures `LLM_PROVIDER=deepseek` and `DEEPSEEK_API_KEY` in local env
- **WHEN** they submit the family or friends prompt to `/api/chat`
- **THEN** the agent uses DeepSeek native tool calling while tool traces and receipts remain mock registry outputs
