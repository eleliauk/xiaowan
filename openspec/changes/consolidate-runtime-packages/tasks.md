## 1. Scaffold Core Package

- [x] 1.1 Create `packages/core` with `package.json`, `tsconfig.json`, and explicit exports for `./agent`, `./llm`, `./tools`, `./data`, and `./shared`.
- [x] 1.2 Move package-level dependencies from the old runtime packages into `@mh/core`, keeping provider/tool dependencies server-oriented and `zod` available for shared schemas.
- [x] 1.3 Add or update package scripts so `@mh/core` participates in `test`, `typecheck`, and `check` consistently with the current workspace.

## 2. Move Runtime Areas

- [x] 2.1 Move `packages/shared/src` into `packages/core/src/shared` and keep stream event, artifact, and shared type exports stable through `@mh/core/shared`.
- [x] 2.2 Move `packages/data/src` into `packages/core/src/data` and update imports from `@mh/shared` to `@mh/core/shared`.
- [x] 2.3 Move `packages/llm/src` into `packages/core/src/llm` and update imports from `@mh/shared` to `@mh/core/shared`.
- [x] 2.4 Move `packages/tools/src` into `packages/core/src/tools` and update imports from `@mh/data` and `@mh/shared` to `@mh/core/data` and `@mh/core/shared`.
- [x] 2.5 Move `packages/agent/src` into `packages/core/src/agent` and update imports from `@mh/llm`, `@mh/tools`, and `@mh/shared` to `@mh/core/llm`, `@mh/core/tools`, and `@mh/core/shared`.

## 3. Update Consumers And Tooling

- [x] 3.1 Update `apps/web` source and tests to import agent runtime from `@mh/core/agent` and client-safe schemas/types from `@mh/core/shared`.
- [x] 3.2 Replace `apps/web` package dependencies on old runtime packages with `@mh/core`.
- [x] 3.3 Update `apps/web/next.config.ts` so runtime transpilation references `@mh/core` instead of the old package list.
- [x] 3.4 Update root Vitest aliases and any TypeScript path references so `@mh/core/<area>` resolves in app and package tests.
- [x] 3.5 Update workspace metadata and lockfile references, then remove the old runtime package directories.

## 4. Guard Client And Server Boundaries

- [x] 4.1 Verify `@mh/core/shared` does not import agent, LLM, tool registry, OpenAI SDK, LangChain runtime wrappers, or other server-only dependencies.
- [x] 4.2 Verify client components and client-side helpers do not import `@mh/core/agent`, `@mh/core/llm`, `@mh/core/tools`, or `@mh/core/data`.
- [x] 4.3 Search active source and config for stale imports from `@mh/agent`, `@mh/llm`, `@mh/tools`, `@mh/data`, and `@mh/shared`.

## 5. Verification

- [x] 5.1 Run targeted runtime tests for chat streaming, runtime convergence, tool display summaries, tool registry behavior, and shared stream events.
- [x] 5.2 Run frontend state tests that cover artifact selection and SSE activity grouping.
- [x] 5.3 Run `pnpm test`.
- [x] 5.4 Run `pnpm typecheck`.
- [x] 5.5 Run `pnpm check`.
- [x] 5.6 Run `openspec validate consolidate-runtime-packages --strict`.
