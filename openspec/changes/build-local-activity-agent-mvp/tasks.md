## 1. Monorepo Foundation

- [ ] 1.1 Create pnpm workspace, Turborepo config, root TypeScript config, lint config, and package scripts.
- [ ] 1.2 Create `apps/web` with Next.js App Router and a first-screen demo workbench shell.
- [ ] 1.3 Create packages `@mh/shared`, `@mh/data`, `@mh/tools`, `@mh/llm`, and `@mh/agent`.
- [ ] 1.4 Add dependencies for Next.js, React, TypeScript, Zod, LangChain JS, LangGraph.js, and OpenAI-compatible chat models.

## 2. Shared Types and Mock Data

- [ ] 2.1 Define Zod schemas and TypeScript types for `UserGoal`, `Plan`, `PlanStep`, `PlanAction`, `ToolCallTrace`, `ToolError`, and `ExecutionReceipt`.
- [ ] 2.2 Add mock user profile data for home location, family members, friend contact, and default preferences.
- [ ] 2.3 Add mock activity data for child-friendly, social, exhibition, citywalk, tabletop, and optional add-on experiences.
- [ ] 2.4 Add mock restaurant data with dietary tags, atmosphere tags, availability windows, queue times, and one controlled no-availability case.
- [ ] 2.5 Add mock delivery product data for cake, flowers, and child gifts.

## 3. Tool Registry and LangChain Wrappers

- [ ] 3.1 Implement the generic `AppTool` interface and registry lookup.
- [ ] 3.2 Implement discovery tools: `getUserProfile`, `estimateTravelTime`, `searchNearbyActivities`, `searchRestaurants`, and `searchAddOnProducts`.
- [ ] 3.3 Implement validation tools: `checkActivityAvailability`, `checkRestaurantAvailability`, and `checkQueueTime`.
- [ ] 3.4 Implement execution tools: `bookActivity`, `reserveRestaurant`, `scheduleDelivery`, and `sendMessage`.
- [ ] 3.5 Implement normalized tool error handling for no availability, long queue, closed business, unavailable delivery, validation failure, and unknown errors.
- [ ] 3.6 Wrap registry tools as LangChain `tool()` instances while preserving schema validation and trace metadata.

## 4. Agent Planning Graph

- [ ] 4.1 Implement `AgentGraphStateAnnotation` and state adapters.
- [ ] 4.2 Implement `parseGoal` with LLM-backed parsing and deterministic fallback for the two demo prompts.
- [ ] 4.3 Implement `generateCandidates` for family and friends scenarios.
- [ ] 4.4 Implement `callTools` to run required discovery and validation tools and append `ToolCallTrace` records.
- [ ] 4.5 Implement `composePlan` with scenario-specific scoring and timeline generation.
- [ ] 4.6 Implement `verifyPlan` for duration, distance, opening hours, availability, queue risk, and scenario fit.
- [ ] 4.7 Implement `repairPlan` for restaurant no-availability, long queue, unavailable activity, and delivery failure fallback.
- [ ] 4.8 Implement `waitForConfirmation` so `/api/plan` returns `READY_FOR_CONFIRMATION` without executing actions.

## 5. Agent Execution Graph

- [ ] 5.1 Implement `executeActions` to run only confirmed `PlanAction` items.
- [ ] 5.2 Ensure execution tools generate receipts and update action status.
- [ ] 5.3 Ensure optional actions can fail without failing required reservations or bookings.
- [ ] 5.4 Return `DONE` when required actions succeed and `PARTIAL_FAILURE` when required actions fail without fallback.

## 6. API Routes and Session Store

- [ ] 6.1 Implement in-memory session store with session ID, messages, selected plan, traces, and receipts.
- [ ] 6.2 Implement `POST /api/plan` with request validation and planning graph invocation.
- [ ] 6.3 Implement `POST /api/execute` with confirmation validation and execution graph invocation.
- [ ] 6.4 Implement `GET /api/sessions/:sessionId` for refreshing session state.

## 7. Web Demo Workbench

- [ ] 7.1 Implement chat input and prepared prompt shortcuts for family and friends scenarios.
- [ ] 7.2 Implement plan timeline with step type, time range, place, notes, risks, and required actions.
- [ ] 7.3 Implement tool trace panel with status, compact input, compact output, and recoverable error display.
- [ ] 7.4 Implement execution panel with confirmation control, disabled states, progress, receipts, and final share message.
- [ ] 7.5 Ensure the first screen is the working demo interface rather than a landing page.

## 8. Verification and Demo Readiness

- [ ] 8.1 Add unit tests for scoring, verification, repair, and tool error normalization.
- [ ] 8.2 Add API tests for `/api/plan` and `/api/execute` covering family and friends scenarios.
- [ ] 8.3 Add a browser smoke test for submitting both prepared prompts and confirming a plan.
- [ ] 8.4 Verify the friends scenario shows a controlled no-availability repair path.
- [ ] 8.5 Run typecheck, lint, and test commands before considering the MVP complete.
