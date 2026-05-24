# Architecture

This document captures the current architecture of the LocalActivity Meituan Agent so future human and AI developers can extend the system without re-discovering the shape of the codebase.

## System Context

```mermaid
flowchart TB
  User["User"]
  Browser["Browser UI"]
  Next["Next.js App<br/>apps/web"]
  ChatAPI["/api/chat<br/>SSE route"]
  Runtime["@mh/core/agent<br/>LocalActivityRuntime"]
  LLM["@mh/core/llm<br/>Fake / DeepSeek / MiniMax"]
  Tools["@mh/core/tools<br/>Tool registry"]
  Data["@mh/core/data<br/>Mock local catalog"]
  Shared["@mh/core/shared<br/>Zod schemas"]

  User --> Browser
  Browser --> Next
  Next --> ChatAPI
  ChatAPI --> Runtime
  Runtime --> LLM
  Runtime --> Tools
  Tools --> Data
  Runtime --> Shared
  ChatAPI --> Browser
```

## Monorepo Boundaries

```mermaid
flowchart LR
  subgraph Web["apps/web"]
    Page["app/page.tsx"]
    Workspace["components/ChatWorkspace.tsx"]
    ChatState["lib/chatState.ts"]
    ApiChat["app/api/chat/route.ts"]
    RuntimeBridge["lib/agentRuntime.ts"]
  end

  subgraph Core["packages/core"]
    Agent["src/agent"]
    Llm["src/llm"]
    Tools["src/tools"]
    Data["src/data"]
    Shared["src/shared"]
  end

  Workspace --> ChatState
  Workspace --> ApiChat
  ApiChat --> RuntimeBridge
  RuntimeBridge --> Agent
  Agent --> Llm
  Agent --> Tools
  Tools --> Data
  Agent --> Shared
  ChatState --> Shared
```

`packages/core` exposes subpaths:

```json
{
  "./agent": "./src/agent/index.ts",
  "./llm": "./src/llm/index.ts",
  "./tools": "./src/tools/index.ts",
  "./data": "./src/data/index.ts",
  "./shared": "./src/shared/index.ts"
}
```

Keep runtime-neutral contracts in `shared`, not in `apps/web`.

## Planning and Artifact Flow

```mermaid
sequenceDiagram
  participant UI as ChatWorkspace
  participant API as /api/chat
  participant RT as LocalActivityRuntime
  participant LLM as LLM Client
  participant T as Tool Registry
  participant DOC as Artifact Renderer

  UI->>API: POST message
  API->>RT: startTurn()
  RT-->>UI: thread.created
  RT-->>UI: agent.step(intent/planning)
  RT->>LLM: chatWithTools(messages, tools)
  LLM-->>RT: tool calls
  loop Tool phase
    RT-->>UI: tool.started(display)
    RT->>T: execute tool
    T-->>RT: output/error
    RT-->>UI: tool.finished(display)
  end
  RT->>RT: verify or synthesize Plan
  RT-->>UI: plan.updated
  RT->>DOC: renderPlanMarkdownArtifact(plan, traces)
  DOC-->>RT: markdown artifact
  RT-->>UI: artifact.updated(status=draft)
  RT-->>UI: confirmation.required
  RT-->>UI: run.completed(READY_FOR_CONFIRMATION)
```

The important design choice: the user-facing Markdown document is rendered after the tool/data phase, not by showing raw tool JSON in the chat.

## Confirmation and Execution Flow

```mermaid
sequenceDiagram
  participant UI as ChatWorkspace
  participant API as /api/chat
  participant RT as LocalActivityRuntime
  participant EX as executeActions
  participant DOC as Artifact Renderer

  UI->>API: POST confirmation + threadId
  API->>RT: startTurn(existingThread)
  RT->>RT: detect confirmation turn
  RT-->>UI: agent.step(execution)
  RT->>EX: execute pending actions
  loop Action
    EX-->>UI: tool.started
    EX-->>UI: tool.finished
    EX-->>UI: execution.receipt
  end
  RT->>DOC: renderFinalMarkdownArtifact(plan, receipts)
  RT-->>UI: artifact.updated(status=final)
  RT-->>UI: run.completed(DONE | PARTIAL_FAILURE)
```

## Event Contract

All stream events are validated by `AgentStreamEventSchema`.

Display metadata is the UI-facing layer:

```ts
type AgentEventDisplay = {
  title: string;
  summary?: string;
  items?: { label: string; value: string; status?: string }[];
  severity?: "info" | "success" | "warning" | "error";
  artifactRef?: "document" | "plan" | "confirmation" | "receipts" | "diagnostics";
};
```

Raw `inputSummary` and `outputSummary` are retained for debugging/export, but normal UI should prefer `display`.

## Agent State Model

```mermaid
stateDiagram-v2
  [*] --> WAITING_FOR_USER
  WAITING_FOR_USER --> STREAMING: user message
  STREAMING --> READY_FOR_CONFIRMATION: plan + document + confirmation
  READY_FOR_CONFIRMATION --> STREAMING: revision message
  READY_FOR_CONFIRMATION --> DONE: confirmation executed
  STREAMING --> PARTIAL_FAILURE: unrecoverable failure
  DONE --> [*]
  PARTIAL_FAILURE --> WAITING_FOR_USER: user revises
```

Thread state is currently in memory:

- messages
- events
- toolTraces
- plan
- artifacts
- pendingConfirmation
- receipts
- error/status

If persistence is added later, preserve this shape first and swap `ThreadStore` / `RunManager` implementations.

## ReAct Convergence

The ReAct node lives in `packages/core/src/agent/nodes/runReActPlanning.ts`.

Current guardrails:

- Duplicate or excessive tool calls are skipped with `tool.finished.status = "skipped"`.
- Execution tools are not available during planning.
- Recoverable tool failures are fed back as observations.
- If the model keeps repairing or calling tools after enough facts exist, runtime synthesizes a normal plan from successful traces.
- Loop-limit fallback produces a partial plan only when facts are incomplete.

This mirrors the DeerFlow lesson: tool execution and artifact/report generation are separate phases. Do not let the model wander forever when the runtime already has enough evidence to produce a usable artifact.

## UI Information Architecture

```mermaid
flowchart LR
  Chat["Chat timeline<br/>readable progress"] --> Activity["Run activity<br/>folded tool steps"]
  Chat --> Composer["Composer"]
  Chat --> Artifacts["Artifact panel"]
  Artifacts --> Document["Document tab<br/>Streamdown Markdown"]
  Artifacts --> Confirmation["Confirmation tab"]
  Artifacts --> Receipts["Receipts tab"]
  Artifacts --> Diagnostics["Diagnostics tab"]
```

Desktop layout:

- chat workspace on the left
- artifact panel on the right
- document tab opens automatically on `artifact.updated`

Mobile layout:

- artifact panel stacks below chat
- composer remains usable and should not cover document content

## Deployment Shape

Recommended first deployment:

```mermaid
flowchart LR
  User --> CF["Cloudflare<br/>DNS / TLS / WAF"]
  CF --> Vercel["Vercel<br/>Next.js app"]
  Vercel --> API["/api/chat SSE"]
  API --> Core["@mh/core runtime"]
```

Initial deployment should keep the runtime inside Vercel. Cloudflare should handle domain, DNS, SSL/TLS, WAF, and cache bypass rules for SSE/API paths.

Future extension options:

- Cloudflare R2 for file-backed Markdown artifacts.
- Cloudflare D1 or a hosted Postgres for thread/run persistence.
- Cloudflare Workers/Queues for long-running jobs.
- Vercel Blob/Postgres if staying fully in the Vercel ecosystem.

## Extension Points

Add a new planning tool:

1. Add data model if needed in `packages/core/src/data`.
2. Add tool in `packages/core/src/tools/mock` or a new provider folder.
3. Register it in `packages/core/src/tools/index.ts`.
4. Add display summary in `packages/core/src/agent/display.ts`.
5. Add tests in `packages/core/src/tools/__tests__` and agent flow tests if the tool affects planning.

Add a new stream event:

1. Extend `AgentStreamEventSchema` in `packages/core/src/shared`.
2. Emit in agent runtime.
3. Fold into client state in `apps/web/lib/chatState.ts`.
4. Render in `ChatWorkspace`.
5. Add shared schema and UI state tests.

Add durable storage:

1. Keep `ThreadStore`, `RunManager`, and `StreamBridge` interfaces stable.
2. Implement new adapters.
3. Keep terminal event ordering tests.
4. Decide artifact store semantics before changing `AgentArtifact`.

## Test Map

- Shared event schema: `packages/core/src/shared/__tests__`
- LLM config/providers: `packages/core/src/llm/__tests__`
- Tool registry: `packages/core/src/tools/__tests__`
- Runtime and ReAct behavior: `packages/core/src/agent/__tests__`
- Frontend event folding: `apps/web/lib/chatState.test.ts`
- API SSE behavior: `apps/web/app/api/chat/route.test.ts`

Run before handing off:

```bash
pnpm test
pnpm typecheck
pnpm check
```
