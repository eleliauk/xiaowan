## ADDED Requirements

### Requirement: Provide a DeerFlow-style chat workspace
The system SHALL present the demo as a chat workspace with a left conversation sidebar and a center conversation surface.

#### Scenario: Workspace opens on the functional chat screen
- **GIVEN** the user opens the web demo
- **WHEN** the first screen renders
- **THEN** the user sees a left sidebar, a center chat area, and a bottom prompt composer without navigating through a landing page

#### Scenario: Sidebar shows conversation history
- **GIVEN** at least one prior thread exists
- **WHEN** the workspace sidebar renders
- **THEN** it lists recent conversations and visually marks the active thread

#### Scenario: New chat starts a fresh thread
- **GIVEN** the user is viewing an existing thread
- **WHEN** the user selects the new-chat action
- **THEN** the center chat area resets to an empty prompt state while preserving prior threads in the sidebar

### Requirement: Use shadcn-compatible UI primitives
The system SHALL build the workspace with shadcn/Radix-compatible primitives, Tailwind design tokens, and lucide icons.

#### Scenario: UI controls use shared primitives
- **GIVEN** the chat workspace renders buttons, menus, dialogs, tooltips, or sidebar controls
- **WHEN** the DOM is inspected
- **THEN** those controls are built from the shared `components/ui` primitives rather than one-off local control styles

#### Scenario: Command buttons use icons
- **GIVEN** the workspace renders common actions such as new chat, send, stop, export, rename, delete, or more
- **WHEN** the controls are displayed
- **THEN** they use appropriate `lucide-react` icons with accessible labels

### Requirement: Apply DeerFlow-inspired warm neutral visual tokens
The system SHALL use warm low-chroma neutral background, sidebar, border, input, and muted tokens with Meituan accent reserved for domain status highlights.

#### Scenario: Background and sidebar use warm neutral tokens
- **GIVEN** the workspace CSS is loaded
- **WHEN** the root tokens are inspected
- **THEN** `--background`, `--sidebar`, `--secondary`, `--muted`, `--border`, and `--input` use warm neutral low-chroma values similar to the DeerFlow palette

#### Scenario: Meituan accent is not dominant
- **GIVEN** a completed plan with receipts is visible
- **WHEN** the page is visually inspected
- **THEN** Meituan yellow is limited to status, receipt, or confirmation accents and does not dominate the app background or message layout

### Requirement: Render agent activity in a DeerFlow-style workspace
The system SHALL render planning and tool progress as compact assistant activity, while richer plan, confirmation, receipt, and failure artifacts live in a workspace artifact panel.

#### Scenario: Tool calls appear in a collapsible assistant block
- **GIVEN** the agent emits tool events while planning
- **WHEN** the message list renders the assistant turn
- **THEN** the tool calls appear inside a collapsible inline block labeled as execution steps

#### Scenario: Tool calls use display metadata
- **GIVEN** a tool event includes `display` metadata
- **WHEN** the execution step block renders
- **THEN** it shows the display title, summary, and compact display items rather than raw JSON input or output

#### Scenario: Markdown plan document appears in the artifact panel
- **GIVEN** the agent emits `artifact.updated` for a markdown plan document
- **WHEN** the workspace renders
- **THEN** the right artifact panel opens to the document view and renders the markdown content instead of showing raw tool JSON or only a structured timeline card

#### Scenario: Structured plan card is a fallback
- **GIVEN** the agent emits `plan.updated` but no markdown artifact is available
- **WHEN** the workspace renders the artifact panel
- **THEN** it may show the structured timeline, budget, confidence, risks, and candidate rationale as a fallback

#### Scenario: Confirmation appears in the artifact panel
- **GIVEN** the agent emits a confirmation request
- **WHEN** the assistant turn renders
- **THEN** the document panel remains selected when a markdown artifact exists and shows confirm/revise affordances alongside the pending actions

#### Scenario: Receipts appear after execution
- **GIVEN** the user confirms the plan and execution succeeds
- **WHEN** the agent emits receipt events
- **THEN** the receipt artifact view shows target name, action type, scheduled time, receipt id, and status

#### Scenario: Failure diagnostics are separated from normal chat
- **GIVEN** the run emits failed or skipped tool events or `run.failed`
- **WHEN** the workspace renders diagnostics
- **THEN** the artifact panel shows concise failure and fallback details, with raw events hidden behind a debug-only disclosure

### Requirement: Preserve demo prompt shortcuts
The system SHALL keep quick access to the required family and friends scenarios without turning them into separate workflow controls.

#### Scenario: Family prompt can be inserted
- **GIVEN** the prompt composer is empty
- **WHEN** the user selects the family scenario suggestion
- **THEN** the composer submits or inserts the family outing prompt for the active thread

#### Scenario: Friends prompt can be inserted
- **GIVEN** the prompt composer is empty
- **WHEN** the user selects the friends scenario suggestion
- **THEN** the composer submits or inserts the four-person friends outing prompt for the active thread
