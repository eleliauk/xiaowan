## 1. DeerFlow-Aligned UI Foundation

- [x] 1.1 Add shadcn/Radix-compatible dependencies to `apps/web`.
- [x] 1.2 Add `cn`, Tailwind token mapping, and warm neutral CSS variables based on DeerFlow's palette.
- [ ] 1.3 Add shadcn-style UI primitives needed for the workspace: button, input, textarea, sidebar, dropdown menu, dialog, scroll area, separator, tooltip, badge, collapsible, and skeleton.
- [x] 1.4 Replace the dashboard-dominant global styles with app-shell, sidebar, message, and prompt-composer styling.

## 2. Shared Chat and Event Contracts

- [ ] 2.1 Add `Thread`, `ChatMessage`, `ChatRun`, `AgentStreamEvent`, `AgentStep`, `ToolStreamState`, `ConfirmationRequest`, and `ExecutionReceipt` schemas to `@mh/shared`.
- [x] 2.2 Add discriminated event types for `thread.created`, `message.delta`, `message.completed`, `agent.step`, `tool.started`, `tool.finished`, `plan.updated`, `confirmation.required`, `execution.receipt`, `run.completed`, and `run.failed`.
- [x] 2.3 Add schema tests for parsing valid events and rejecting malformed or unknown event payloads.
- [x] 2.4 Add optional display metadata to stream events and allow skipped tool completion events.

## 3. Stream-First Agent Runner

- [x] 3.1 Add `runChatTurn(input): AsyncIterable<AgentStreamEvent>` to `@mh/agent`.
- [x] 3.2 Refactor planning nodes to emit `agent.step`, `tool.*`, `plan.updated`, and assistant message events while preserving current deterministic behavior.
- [x] 3.3 Move confirmation handling into the chat runner so "确认，就按这个安排" resumes execution in the same thread.
- [x] 3.4 Add idempotency handling for `clientRunId` and confirmed execution actions.
- [x] 3.5 Keep deterministic mock data and fallback paths for family and friends demo scenarios.
- [x] 3.6 Add ReAct duplicate-tool guardrails and loop-limit fallback plan composition.

## 4. Single Chat SSE API

- [x] 4.1 Implement `POST /api/chat` with request validation and `text/event-stream` response headers.
- [x] 4.2 Encode each `AgentStreamEvent` as an SSE frame with stable event names and JSON payloads.
- [x] 4.3 Add abort handling so client disconnects cancel unconfirmed planning work safely.
- [x] 4.4 Add API tests for family planning, friends repair path, confirmation-required state, confirmed execution receipts, and normalized failures.
- [x] 4.5 Remove React UI calls to `/api/plan` and `/api/execute`; delete those legacy routes after chat API parity tests pass.

## 5. Thread History and Workspace State

- [x] 5.1 Add an in-memory thread store for MVP with thread list, active thread, messages, latest events, run status, plan artifact, and receipts.
- [ ] 5.2 Add thread actions for create, rename, delete, and retrieve current state.
- [x] 5.3 Add a client hook that sends a user turn to `/api/chat`, reads SSE frames, updates messages/events/steps/artifacts, and supports stop/retry.
- [x] 5.4 Ensure optimistic user messages are replaced or deduplicated when server events arrive.

## 6. Chat Workspace UI

- [x] 6.1 Replace `Workbench` with `ChatWorkspace` as the first screen.
- [x] 6.2 Implement a left sidebar with brand, new-chat action, primary nav, recent thread list, active state, and footer settings affordance.
- [x] 6.3 Implement the center chat surface with thread header, message list, inline streaming indicator, bottom composer, and empty/welcome state.
- [x] 6.4 Render user messages as compact soft bubbles and assistant messages as mostly unframed readable content.
- [x] 6.5 Render agent steps and tool calls inside collapsible inline blocks instead of a separate right panel.
- [x] 6.6 Render `plan.updated`, `confirmation.required`, `execution.receipt`, and final share message as chat-native cards.
- [x] 6.7 Keep prepared family and friends prompts as quick suggestions in the composer or empty state.
- [x] 6.8 Move rich plan, confirmation, receipt, and failure artifacts into a DeerFlow-style right artifact panel while keeping compact activity inline.

## 7. Verification and Demo Readiness

- [x] 7.1 Run unit tests for shared event schemas and agent stream behavior.
- [x] 7.2 Run API tests for `/api/chat` SSE framing and completion states.
- [x] 7.3 Run typecheck and lint for all TypeScript packages.
- [x] 7.7 Add focused tests for display metadata parsing, skipped tool events, loop-limit fallback, artifact-panel state, and terminal SSE ordering.
- [ ] 7.4 Browser-test the family prompt from new chat through confirmation and final receipts.
- [ ] 7.5 Browser-test the four-friends prompt and verify the controlled no-availability repair path appears inline.
- [ ] 7.6 Check desktop and narrow viewport screenshots for sidebar collapse, composer fit, no text overlap, and non-dominant Meituan accent use.

## 8. Markdown Artifact Document

- [x] 8.1 Add shared `AgentArtifact` schema and `artifact.updated` stream event with `display.artifactRef = "document"`.
- [x] 8.2 Add deterministic plan/final Markdown artifact renderers that derive content from `Plan`, diagnostics, and execution receipts.
- [x] 8.3 Emit `plan.updated -> artifact.updated -> confirmation.required` for planning runs and emit a final `artifact.updated` after execution receipts.
- [x] 8.4 Add `streamdown` to the web app and render markdown artifacts as the default right-side document panel.
- [x] 8.5 Update client state so `artifact.updated` opens/selects the document panel and confirmation no longer steals selection from an existing document.
- [x] 8.6 Add shared, runtime, frontend state, and API tests for artifact parsing, event ordering, markdown content, and final receipt updates.
