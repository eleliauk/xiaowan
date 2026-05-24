# AGENTS.md

This file is for future AI and human contributors working in this repository.

## Project Snapshot

This is a Next.js + TypeScript monorepo for a local activity planning Agent. The current runtime is intentionally small and mostly in-memory:

- `apps/web` renders the chat workspace and exposes `/api/chat`.
- `packages/core` contains agent runtime, LLM clients, mock tools, mock data, and shared schemas.
- OpenSpec changes under `openspec/changes` are the source of product/architecture decisions.

Read these first:

1. `README.md`
2. `docs/architecture.md`
3. Active OpenSpec changes:
   - `openspec/changes/refactor-chat-sse-workbench`
   - `openspec/changes/align-agent-runtime-with-deerflow`
   - `openspec/changes/consolidate-runtime-packages`

## Golden Path

Use these commands:

```bash
pnpm dev
pnpm test
pnpm typecheck
pnpm check
```

When touching stream contracts or runtime behavior, run at least:

```bash
pnpm vitest run packages/core/src/shared/__tests__/streamEvents.test.ts
pnpm vitest run packages/core/src/agent/__tests__/llmDrivenLoop.test.ts
pnpm vitest run apps/web/app/api/chat/route.test.ts
pnpm vitest run apps/web/lib/chatState.test.ts
```

## Architecture Rules

### Keep Contracts in Shared

Any event, plan, receipt, artifact, or tool trace shape belongs in `packages/core/src/shared`.

Do not invent frontend-only stream shapes unless they are explicitly local view models.

### Keep Runtime Boundaries Clean

`apps/web` should call the agent runtime through `apps/web/lib/agentRuntime.ts`.

Do not import deep runtime internals directly into React components.

### Treat SSE Ordering as a Contract

Planning should preserve:

```txt
plan.updated -> artifact.updated -> confirmation.required -> run.completed
```

Execution should preserve:

```txt
execution.receipt* -> artifact.updated(final) -> run.completed
```

### Prefer Display Metadata Over Raw JSON

Raw `inputSummary` and `outputSummary` are useful for debug/export. Normal UI should render `display.title`, `display.summary`, and `display.items`.

If you add a tool, add a readable display summary in `packages/core/src/agent/display.ts`.

### Artifact Is the Product Output

Do not show tool logs as the final user output.

The current DeerFlow-inspired pattern is:

1. collect tool facts
2. produce structured `Plan`
3. render Markdown `AgentArtifact`
4. show document in artifact panel
5. after confirmation, append receipts to the same artifact

### Planning Must Converge

The ReAct loop can call tools, but runtime must prevent wandering:

- skip duplicate/excessive calls
- stop when facts are sufficient
- synthesize a normal plan from successful traces when possible
- reserve fallback plans for incomplete facts only
- never execute booking/reservation/message tools before confirmation

## OpenSpec Workflow

Before creating a new change, check whether an active change already covers the work.

For this area, prefer continuing:

- `refactor-chat-sse-workbench` for stream/UI/artifact behavior
- `align-agent-runtime-with-deerflow` for runtime phases, ordering, and confirmation execution
- `consolidate-runtime-packages` for package boundary cleanup

Do not duplicate specs for the same behavior.

## Development Notes

### Adding a Tool

1. Add or update mock data in `packages/core/src/data`.
2. Add the tool in `packages/core/src/tools/mock`.
3. Register/export it through `packages/core/src/tools`.
4. Add `toolStartedDisplay` / `toolFinishedDisplay` behavior if needed.
5. Add registry and agent tests.

### Adding a Stream Event

1. Extend `AgentStreamEventSchema`.
2. Emit from agent runtime.
3. Update client folding in `apps/web/lib/chatState.ts`.
4. Render in `ChatWorkspace`.
5. Add schema, runtime/API, and frontend state tests.

### Adding Persistence

Start by replacing interfaces, not rewriting callers:

- `ThreadStore`
- `RunManager`
- `StreamBridge`

Keep `ThreadState` shape compatible unless an OpenSpec change says otherwise.

### Deployment

Recommended first production shape:

- Vercel: Next.js app and `/api/chat` SSE route.
- Cloudflare: DNS, TLS, WAF, and cache bypass for API/SSE paths.

Do not move agent runtime to Cloudflare Workers unless a change explicitly introduces durable jobs or storage.

## Style and Safety

- Use existing patterns before adding abstractions.
- Do not revert unrelated user changes in a dirty worktree.
- Keep tests close to the behavior being changed.
- Avoid raw JSON in normal user-facing UI.
- Use `apply_patch` for manual edits.
- Before claiming completion, run the relevant verification commands and read the output.
