## Why

Users asking for a short local outing do not want a list of search results; they want the plan to be checked, scheduled, and made executable. This change creates a TypeScript monorepo MVP that demonstrates a real planning-and-execution agent for afternoon activities, meals, reservations, delivery add-ons, and final message sharing.

## What Changes

- Add a Next.js web demo where a user enters one natural-language goal and receives an executable 4-6 hour local plan.
- Add a LangGraph.js agent runtime that separates planning, tool lookup, plan verification, repair, user confirmation, and execution.
- Add LangChain JS tool wrappers backed by deterministic TypeScript mock tools for activities, restaurants, queue time, reservations, delivery, and messaging.
- Add shared Zod schemas and TypeScript types for goals, plans, steps, actions, tool traces, errors, and receipts.
- Add demo data and scoring policies for two required scenarios: a family outing and a four-person friends outing.
- Add a visible tool trace and execution receipt model so the demo can prove that the agent checked availability before proposing or executing actions.
- No breaking changes. This is a greenfield MVP.

## Capabilities

### New Capabilities

- `activity-planning`: Natural-language goal understanding and scenario-specific afternoon plan generation.
- `agent-orchestration`: LangGraph-based planning, verification, repair, confirmation, and execution control flow.
- `tool-execution`: Typed tool registry, mock Meituan-like tool calls, error normalization, fallback behavior, and execution receipts.
- `web-demo-workbench`: Web UI and API surface for chat input, plan timeline, tool trace, confirmation, and execution progress.

### Modified Capabilities

- None.

## Impact

- Adds monorepo scaffolding under `apps/` and `packages/`.
- Adds dependencies on `@langchain/langgraph`, `langchain`, `@langchain/core`, `@langchain/openai`, `zod`, `next`, `react`, `typescript`, `pnpm`, and `turbo`.
- Adds local mock data for user profile, activities, restaurants, availability, queue time, delivery products, and messaging contacts.
- Adds two API routes: `/api/plan` and `/api/execute`.
- Adds a demo-only in-memory session store. Persistence can later move to SQLite or LangGraph checkpoints.
