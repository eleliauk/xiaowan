## Context

The project starts from a mostly empty repository with an existing architecture note in `docs/mvp-agent-loop-architecture.md`. The demo must prove a Meituan-style local short-activity agent can turn one natural-language request into a validated and executable afternoon plan.

The key product distinction is:

```text
Search recommendation: "Here are places you might like."
Execution agent:       "I checked the plan, found availability, fixed conflicts, and can arrange it after you confirm."
```

The MVP is greenfield and TypeScript-only. It should optimize for demo clarity, traceability, and implementation speed rather than real payments or real Meituan API integration.

## Goals / Non-Goals

**Goals:**

- Build a monorepo that keeps UI, agent runtime, tools, data, shared schemas, and LLM integration separate.
- Use LangGraph.js for explicit state-machine orchestration instead of a single black-box agent call.
- Use LangChain JS for model and tool abstractions.
- Show a complete plan-before-execute lifecycle in the UI.
- Demonstrate at least one recoverable failure, such as a restaurant with no table at the first requested time.
- Keep all mock execution receipts grounded in tool outputs.

**Non-Goals:**

- Do not integrate real Meituan APIs in the MVP.
- Do not perform real payment, real booking, or real delivery.
- Do not build long-term memory or complex user profile learning.
- Do not build a generic travel planner beyond the two required demo scenarios.
- Do not let LLM output alone mutate execution state.

## Decisions

### Decision 1: Use pnpm workspace and Turborepo

Use a TypeScript monorepo with `apps/web` and multiple `packages/*`.

```text
apps/web
  Next.js UI + API routes

packages/agent
  LangGraph graphs and agent nodes

packages/tools
  Tool registry + LangChain tool wrappers

packages/data
  Mock activity, restaurant, product, and user data

packages/shared
  Zod schemas and TypeScript types

packages/llm
  LangChain chat model factory and deterministic fake model
```

Alternatives considered:

- Single Next.js app only: faster initially, but hides agent boundaries and makes the demo look like a prompt wrapper.
- Separate Fastify backend: cleaner service boundary, but unnecessary for the MVP and adds local orchestration cost.

### Decision 2: Use LangGraph for orchestration

Planning and execution will be separate LangGraph graphs.

```text
Planning graph
──────────────
START
  │
  ▼
parseGoal
  │
  ├── missing info ─────▶ WAITING_FOR_USER
  │
  ▼
generateCandidates
  │
  ▼
callTools
  │
  ▼
composePlan
  │
  ▼
verifyPlan
  │
  ├── invalid ─────────▶ repairPlan ───▶ verifyPlan
  │
  ▼
waitForConfirmation
  │
  ▼
END

Execution graph
───────────────
START
  │
  ▼
executeActions
  │
  ├── required action failed ─▶ PARTIAL_FAILURE
  │
  ▼
DONE
```

Rationale:

- The demo must show explicit planning, validation, repair, and confirmation.
- Conditional graph edges are easier to explain than opaque ReAct loops.
- Planning can stop safely before execution.

Alternative considered:

- LangChain `createAgent()` for the whole flow. This is simpler, but it hides the important distinction between planning and execution and makes repair behavior harder to demonstrate.

### Decision 3: Keep tools business-first, then wrap for LangChain

Define tools in a local registry first:

```ts
type AppTool<I, O> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  handler: (input: I, context: ToolContext) => Promise<O>;
};
```

Then wrap each tool as a LangChain `tool()` for graph nodes that use model-directed tool calling.

Rationale:

- Tool behavior remains testable without LangChain.
- Tool outputs can be validated and converted into stable UI traces.
- Later, mock handlers can be replaced with real APIs without changing planner logic.

### Decision 4: Use deterministic mock data with one planned failure

The MVP will use local data to simulate:

- User home location and contacts.
- Activities with tags, opening hours, price, capacity, and distance.
- Restaurants with tags, availability windows, queue time, and dietary fit.
- Delivery products such as flowers, cake, or child gifts.

At least one friend scenario restaurant should intentionally fail at 18:00 and recover at 18:30 or with a backup restaurant.

Rationale:

- A controlled failure makes the agent feel real during the demo.
- Deterministic data makes demo rehearsals stable.

### Decision 5: Use API routes as a BFF only

`apps/web` exposes:

- `POST /api/plan`
- `POST /api/execute`
- `GET /api/sessions/:sessionId`

The routes validate request data, call `@mh/agent`, store session state, and return UI-ready responses. They do not contain planning logic.

### Decision 6: Treat LLM as bounded assistance

The model may parse goals, produce natural-language explanation, generate candidate ideas, and draft final messages. The model must not:

- Mark tools as successful.
- Invent booking identifiers.
- Skip the confirmation gate.
- Decide that a failed required action is successful.

Execution status comes from TypeScript graph state and tool handler outputs.

## Risks / Trade-offs

- [Risk] LangGraph.js API shape may differ by package version. → Pin package versions after the first successful scaffold and keep graph construction small.
- [Risk] LLM tool calling can introduce nondeterminism. → Provide a deterministic fake model path and rule-based fallback for the two demo scenarios.
- [Risk] Too many capabilities may slow implementation. → Build in vertical slices, starting with a family plan from mock data before generalizing.
- [Risk] UI may over-explain instead of demonstrating action. → Keep the first screen focused on chat, timeline, tool trace, and execution receipts.
- [Risk] Fake data can make the demo feel scripted. → Include visible failed availability and repair traces to show runtime decision-making.

## Migration Plan

This is a greenfield MVP, so there is no migration. Implementation should proceed in slices:

1. Create monorepo and shared schemas.
2. Add mock data and tool registry.
3. Add static planning API and timeline UI.
4. Add LangChain tool wrappers and tool trace panel.
5. Add LangGraph planning graph and repair behavior.
6. Add execution graph and receipts.
7. Add friends scenario and rehearsed failure path.

Rollback strategy: since this is greenfield, any unstable slice can be disabled by returning deterministic static plans from `/api/plan` while preserving the UI shell.

## Open Questions

- Which OpenAI-compatible model will be used during the final demo, if any?
- Should the demo show streaming node progress, or is a completed trace enough for the first version?
- Should confirmation allow selecting individual actions, or execute all required actions together in MVP?
