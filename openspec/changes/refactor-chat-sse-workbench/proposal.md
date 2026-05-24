## Why

The current MVP proves planning and execution, but the product shape is still a dashboard: the frontend calls `/api/plan`, shows a separate timeline and tool panel, then calls `/api/execute`. That exposes internal orchestration to the UI and conflicts with the intended "help me get this done" experience.

DeerFlow demonstrates a better interaction model for this project: a quiet chat workspace with a left conversation history, a centered conversation, and one streaming run where the agent owns planning, tool use, confirmation, and execution. The frontend should render agent events, not coordinate the agent.

## What Changes

- Refactor the web demo into a DeerFlow-style chat workspace:
  - Left sidebar for new chat, conversation history, active thread state, and lightweight thread actions.
  - Center chat surface with header, message list, streaming agent steps, and bottom prompt composer.
  - No separate first-screen plan/timeline/tool dashboard.
- Adopt DeerFlow's frontend stack and visual language:
  - Use shadcn/Radix UI primitives, Tailwind design tokens, `lucide-react` icons, and `sonner` toasts.
  - Use warm low-chroma neutral tokens similar to DeerFlow's off-white background, muted sidebar, subtle borders, and rounded prompt composer.
- Replace frontend-driven `/api/plan` and `/api/execute` calls with one chat stream:
  - The browser sends user turns to one chat endpoint.
  - The agent loop autonomously parses intent, plans, calls tools, repairs, asks for confirmation, executes confirmed actions, and emits stream events.
  - Confirmation happens inside the same chat thread as a user turn, not through a second execution API.
- Add a typed event protocol for SSE display:
  - Text deltas for normal assistant output.
  - Structured step, tool, plan, confirmation, receipt, error, and completion events for UI rendering.
- Keep the local short-activity domain intact:
  - Family and friends demo prompts still produce executable 4-6 hour afternoon arrangements.
  - Availability, queue, reservation, delivery, and message actions still run through typed tools and receipts.

## Capabilities

### New Capabilities

- `chat-workspace-ui`: DeerFlow-style shadcn workspace layout, sidebar history, center chat, prompt composer, and inline agent event rendering.
- `streaming-chat-api`: Single chat endpoint contract for SSE streaming, cancellation, thread creation, and in-thread confirmation.
- `agent-event-protocol`: Typed event envelope shared by agent runtime and UI for messages, tool calls, plan updates, confirmation prompts, receipts, and failures.

### Modified Capabilities

- `web-demo-workbench`: Superseded by `chat-workspace-ui`; the old dashboard workbench should stop owning plan and execute orchestration.
- `agent-orchestration`: The graph should expose a streaming chat-turn runner instead of only request/response planning and execution functions.

## Impact

- Adds shadcn/Radix-style UI dependencies to the web app: Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, and optional `use-stick-to-bottom`.
- Adds a single web chat endpoint, proposed as `POST /api/chat`, that returns `text/event-stream`.
- Removes the requirement that the React UI call `/api/plan` and `/api/execute` directly.
- Requires a thread/session model for conversation history and run state.
- Requires the agent package to expose a stream-capable chat runner that can yield typed `AgentStreamEvent` objects.
- Preserves deterministic mock tools so the demo remains reliable without real Meituan integrations.
