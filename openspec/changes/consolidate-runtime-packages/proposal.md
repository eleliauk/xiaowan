## Why

The current runtime is split across `@mh/agent`, `@mh/llm`, `@mh/tools`, `@mh/data`, and `@mh/shared`, but the MVP now behaves as one tightly coupled agent runtime after the old graph cleanup. Keeping five workspace packages creates extra import aliases, Next transpile config, Turborepo tasks, and cognitive jumps without a matching ownership or deployment boundary.

## What Changes

- **BREAKING**: Replace the five runtime workspace packages with a single `@mh/core` package.
- Preserve logical boundaries through subpath exports:
  - `@mh/core/agent`
  - `@mh/core/llm`
  - `@mh/core/tools`
  - `@mh/core/data`
  - `@mh/core/shared`
- Keep `@mh/core/shared` as the client-safe entrypoint for SSE schemas, artifact types, and shared UI contracts.
- Keep server-only runtime code under explicit subpaths; the package must not expose a broad root barrel that can accidentally pull LLM or tool dependencies into the browser bundle.
- Update web app imports, package dependencies, Vitest aliases, Next transpile config, and workspace metadata to target `@mh/core`.
- Remove the old runtime package directories after test and typecheck parity is restored.
- Do not change agent behavior, SSE event semantics, mock data behavior, or execution safety boundaries in this change.

## Capabilities

### New Capabilities

- `core-package-architecture`: Defines the single-package runtime architecture, subpath exports, client/server import boundaries, and migration acceptance criteria.

### Modified Capabilities

- None.

## Impact

- Affected packages: `packages/agent`, `packages/llm`, `packages/tools`, `packages/data`, `packages/shared`, and new `packages/core`.
- Affected app code: `apps/web` imports, server route dependencies, shared SSE state usage, and Next transpile package settings.
- Affected repo config: root/package workspace references, Vitest aliases, TypeScript project references or package configs, lockfile entries, and Turborepo package task graph.
- Public workspace import paths change from `@mh/{agent,llm,tools,data,shared}` to `@mh/core/<subpath>`.
