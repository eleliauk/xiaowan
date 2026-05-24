## DeerFlow Findings

The local DeerFlow clone shows a coherent pattern worth copying rather than loosely imitating.

- Layout source:
  - `/Users/shanyujia/code/deer-flow/frontend/src/app/workspace/workspace-content.tsx`
  - `/Users/shanyujia/code/deer-flow/frontend/src/components/workspace/workspace-sidebar.tsx`
  - `/Users/shanyujia/code/deer-flow/frontend/src/app/workspace/chats/[thread_id]/page.tsx`
- Interaction source:
  - `/Users/shanyujia/code/deer-flow/frontend/src/core/threads/hooks.ts`
  - `/Users/shanyujia/code/deer-flow/frontend/src/core/api/api-client.ts`
- Visual source:
  - `/Users/shanyujia/code/deer-flow/frontend/src/styles/globals.css`
  - `/Users/shanyujia/code/deer-flow/frontend/src/components/workspace/input-box.tsx`
  - `/Users/shanyujia/code/deer-flow/frontend/src/components/ai-elements/message.tsx`

The relevant product lessons:

- The UI is workspace-first, not landing-page-first.
- The sidebar is navigation and memory, not a dense control panel.
- Assistant content is mostly unframed text; user content is the bubble.
- Tool and plan detail is shown inline as collapsible or specialized message content.
- The prompt composer is the primary control surface.
- Streaming is treated as the source of truth. The UI does not call separate "plan" and "execute" routes.

## Target Product Shape

```text
┌──────────────────────┬────────────────────────────────────────────────────┐
│ LocalActivity         │ Thread title                         Export / More │
│ ──────────────────── │────────────────────────────────────────────────────│
│ + New chat            │                                                    │
│ 对话                 │   User: 今天下午是空的...                           │
│ 智能体               │                                                    │
│                      │   Assistant: 我先看下附近适合孩子的活动...           │
│ 最近对话             │                                                    │
│ 家庭周六下午          │   ▾ 执行步骤                                       │
│ 朋友四人局            │     - 识别场景: family                             │
│                      │     - 查询亲子活动: 3 个候选                         │
│                      │     - 查询餐厅可订位: 2 个可用                       │
│ 设置                 │                                                    │
│                      │   Assistant: 方案确认一下...                         │
│                      │                                                    │
│                      │   ┌──────────────────────────────────────────────┐ │
│                      │   │ 今天我能为你做些什么？                    ↑ │ │
│                      │   └──────────────────────────────────────────────┘ │
└──────────────────────┴────────────────────────────────────────────────────┘
```

## Frontend Component Strategy

Use the same component family as DeerFlow:

- shadcn-style primitives under `apps/web/components/ui/*`.
- Radix primitives for dialog, dropdown menu, scroll area, separator, slot, tooltip, collapsible, and textarea behavior.
- `lucide-react` for all command icons: new chat, sidebar toggle, send, stop, export, more, delete, rename, tool status, receipt.
- `sonner` for lightweight error and completion toasts.
- `class-variance-authority`, `clsx`, and `tailwind-merge` for variant composition and class merging.
- `use-stick-to-bottom` or equivalent local hook for chat scroll locking.

Initial shadcn components to add:

- `button`
- `textarea`
- `input`
- `sidebar`
- `dropdown-menu`
- `dialog`
- `scroll-area`
- `separator`
- `tooltip`
- `badge`
- `collapsible`
- `skeleton`

## Visual Tokens

The MVP should use DeerFlow's warm neutral direction, adjusted only for Meituan domain accents. Avoid the current stronger green dashboard palette as the dominant visual language.

| Token | Purpose | Proposed value |
| --- | --- | --- |
| `--background` | main app background | `oklch(0.9855 0.0098 87.47)` |
| `--foreground` | primary text | `oklch(0.145 0 0)` |
| `--secondary` | user bubble and active soft fill | `oklch(0.9455 0.0098 87.47)` |
| `--muted` | subtle surfaces | `oklch(0.97 0.0098 87.47)` |
| `--muted-foreground` | secondary text | `oklch(0.556 0 0)` |
| `--accent` | hover and selected sidebar item | `oklch(0.94 0.0098 87.47)` |
| `--border` | subtle dividers | `oklch(0.922 0.0098 87.47)` |
| `--input` | composer border | `oklch(0.88 0.0098 87.47)` |
| `--sidebar` | sidebar background | `oklch(0.965 0.0098 87.47)` |
| `--primary` | primary command text/fill | `oklch(0 0 0)` |
| `--meituan` | domain accent for receipts/status only | `oklch(0.78 0.16 82)` |

Use Meituan yellow sparingly for receipts, confirmation highlights, and successful bookings. It should not dominate the layout.

## API Shape

The UI should submit every user turn to one endpoint:

```http
POST /api/chat
Accept: text/event-stream
Content-Type: application/json
```

Request:

```json
{
  "threadId": "thread_123 or null",
  "message": "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。",
  "clientRunId": "optional idempotency key",
  "context": {
    "location": "home",
    "mode": "demo"
  }
}
```

The response is an SSE stream. Each frame uses one event name and one JSON payload.

```text
event: thread.created
data: {"threadId":"thread_123","title":"周六家庭下午安排"}

event: agent.step
data: {"runId":"run_123","phase":"planning","title":"查询附近亲子活动","status":"running"}

event: message.delta
data: {"messageId":"msg_456","role":"assistant","delta":"我先看下附近适合 5 岁孩子的活动..."}

event: confirmation.required
data: {"planId":"plan_789","summary":"下午 2 点出发...","actions":[...]}

event: run.completed
data: {"runId":"run_123","state":"READY_FOR_CONFIRMATION"}
```

Confirmation is just another user turn:

```json
{
  "threadId": "thread_123",
  "message": "确认，就按这个安排",
  "clientRunId": "confirm_001"
}
```

The agent then resumes inside the same thread and emits execution tool events and receipts. The frontend never calls `/api/execute`.

## Agent Runtime Shape

Expose a stream-first runner from `@mh/agent`:

```ts
type RunChatTurnInput = {
  threadId?: string;
  message: string;
  clientRunId?: string;
  context?: ChatContext;
};

type RunChatTurnOutput = AsyncIterable<AgentStreamEvent>;
```

The internal graph can still keep distinct nodes:

```text
parseGoal
  -> planCandidates
  -> callDiscoveryTools
  -> verifyAndRepair
  -> composeConfirmation
  -> waitForConfirmation
  -> executeActions
  -> composeFinalShareMessage
```

But those nodes are no longer exposed as separate browser actions. They only emit typed stream events.

## UI Rendering Model

The frontend maintains four stores per thread:

- `messages`: human and assistant message content.
- `events`: raw typed stream events for debugging and replay.
- `steps`: normalized agent step/tool state grouped by run.
- `artifacts`: current plan, confirmation request, receipts, and final share message.

Rendering rules:

- `message.delta` appends to the active assistant message.
- `agent.step` and `tool.*` render inside a collapsible "执行步骤" block in the assistant turn.
- `plan.updated` renders a compact itinerary card inside the assistant turn.
- `confirmation.required` renders confirm and revise actions inside the chat, but submitting them still calls only `/api/chat`.
- `execution.receipt` renders a receipt card and also updates the final summary.
- `run.failed` keeps the partial transcript visible and offers retry from the same input.

## Migration Strategy

1. Add shadcn/Radix dependencies and design tokens first.
2. Introduce thread and stream types in shared packages.
3. Add the stream-capable agent runner while keeping the existing deterministic tools.
4. Add `/api/chat` and tests for SSE framing.
5. Replace `Workbench` with `ChatWorkspace`.
6. Remove direct frontend dependencies on `/api/plan` and `/api/execute`.
7. Keep old route tests only until chat API parity is verified, then delete or mark legacy.

## Error Handling

- Stream serialization errors emit `run.failed` before closing if possible.
- Tool failures emit `tool.finished` with `status: "failed"` and normalized error code.
- Recoverable failures emit a subsequent `agent.step` or `plan.updated` that explains fallback.
- Confirmation timeout leaves the thread in `READY_FOR_CONFIRMATION`; user can continue later.
- Duplicate `clientRunId` returns or replays the existing run state instead of double-booking.
- Browser abort cancels the current stream. Confirmed execution steps must remain idempotent.

## Open Questions

- Persistence can remain in-memory for hackathon MVP, but the thread API should be shaped so SQLite or LangGraph checkpoints can be added later.
- The initial UI can omit DeerFlow's artifact side panel. If final receipts or route maps become too rich, add a right artifact panel after the chat workspace is stable.
