## Context

The runtime package graph is currently:

```text
apps/web -> @mh/agent
apps/web -> @mh/shared
@mh/agent -> @mh/llm, @mh/tools, @mh/shared
@mh/tools -> @mh/data, @mh/shared
@mh/llm -> @mh/shared
@mh/data -> @mh/shared
```

This split originally made sense while the agent graph, API response adapters, tools, mock data, and shared contracts were evolving independently. After the runtime cleanup, these packages now form one MVP runtime with no separate deployment lifecycle, no separate ownership, and no independent publication target. The split mainly surfaces as import churn and config duplication.

The target shape is one workspace package with explicit subpath boundaries:

```text
packages/core/
  src/
    agent/
    llm/
    tools/
    data/
    shared/
```

The package should behave as a modular runtime package, not as a root barrel.

## Goals / Non-Goals

**Goals:**

- Replace five tightly coupled runtime packages with one `@mh/core` workspace package.
- Preserve readable architecture boundaries through `@mh/core/<area>` subpath exports.
- Keep `@mh/core/shared` safe for client-side imports.
- Make package config, Vitest aliases, Next transpile settings, and workspace dependency management simpler.
- Preserve all current agent, SSE, tool, mock data, and UI behavior.

**Non-Goals:**

- No behavior changes to `/api/chat`, the ReAct runtime, SSE display metadata, or artifact rendering.
- No real Meituan API, payment, ordering, persistence, or database integration.
- No introduction of a new build system or package manager.
- No attempt to publish `@mh/core` outside this workspace.
- No broad root export that re-exports every runtime module.

## Decisions

### Use one `@mh/core` package with subpath exports

`@mh/core` will expose only explicit runtime areas:

```json
{
  "name": "@mh/core",
  "exports": {
    "./agent": "./src/agent/index.ts",
    "./llm": "./src/llm/index.ts",
    "./tools": "./src/tools/index.ts",
    "./data": "./src/data/index.ts",
    "./shared": "./src/shared/index.ts"
  }
}
```

Rationale: this removes package-level overhead while preserving the names of the logical areas the code already uses. It also avoids an attractive but unsafe root import like `@mh/core` from client components.

Alternative considered: keep the five packages and only improve docs. That would preserve theoretical modularity, but it keeps the current alias/config burden and does not match the MVP's actual ownership boundary.

Alternative considered: create a single root barrel. That is easier to import, but it risks pulling server-only LLM/tool dependencies into browser code and makes boundaries less visible.

### Keep shared as the only client-safe runtime entrypoint

Client components and client-side state helpers must import shared stream schemas, artifact types, and display contracts from `@mh/core/shared`. `@mh/core/shared` must not import from `agent`, `llm`, `tools`, or provider SDKs.

Rationale: the web app already needs shared SSE and artifact types on both sides of the boundary. Making this explicit prevents accidental browser bundling of OpenAI, LangChain, or tool execution code.

Alternative considered: split `shared` back out as its own package. That is safer in a large production monorepo, but for this MVP it keeps the extra-package problem alive. A strict subpath boundary is enough for now.

### Use subpath imports between internal areas

Internal runtime areas should import other areas through `@mh/core/<area>` rather than deep relative paths when crossing an area boundary:

```text
agent -> @mh/core/llm, @mh/core/tools, @mh/core/shared
tools -> @mh/core/data, @mh/core/shared
llm -> @mh/core/shared
data -> @mh/core/shared
```

Rationale: subpath imports keep architectural dependencies searchable and stable after files move. Relative imports remain appropriate within the same area.

Alternative considered: use only relative imports inside `packages/core`. That avoids package self-reference complexity, but it makes cross-area boundaries harder to audit.

### Update consumers and tooling in the same migration

The migration must update:

- `apps/web/package.json` dependency from `@mh/agent` and `@mh/shared` to `@mh/core`.
- `apps/web/next.config.ts` transpile package list to include only `@mh/core` for runtime packages.
- Root Vitest aliases for `@mh/core/<area>` and any test helpers.
- Workspace package manifests and lockfile references.
- Imports in app, package source, and tests.

Rationale: leaving compatibility aliases for the old packages would hide stale architecture and make the consolidation incomplete.

Alternative considered: add temporary wrapper packages that re-export from `@mh/core`. This reduces migration risk but contradicts the stated cleanup goal.

## Risks / Trade-offs

- Server-only dependencies leak into client bundles -> Mitigate by not exposing a root barrel and by keeping `@mh/core/shared` dependency-clean.
- TypeScript, Vitest, or Next resolve subpath exports differently -> Mitigate by updating aliases/config together and verifying with `pnpm typecheck`, `pnpm test`, and `pnpm check`.
- Loss of package-level Turborepo cache granularity -> Accept for the MVP because the packages are small and tightly coupled.
- Historical OpenSpec/docs references still mention old package names -> Mitigate by requiring source/config searches to be clean while allowing archived notes to remain historical.
- A large file move can obscure behavioral changes -> Mitigate by doing move/import updates separately from runtime behavior changes and relying on test parity.

## Migration Plan

1. Scaffold `packages/core` with `package.json`, `tsconfig.json`, and subpath exports.
2. Move `shared`, `data`, `llm`, `tools`, and `agent` source into `packages/core/src/<area>` while preserving file names where possible.
3. Update cross-area imports to `@mh/core/<area>` and same-area imports to local relative paths.
4. Update `apps/web`, Vitest aliases, Next transpile packages, root workspace metadata, and lockfile references.
5. Delete the old runtime package directories after source imports and tests are green.
6. Run verification and stale-reference searches before marking tasks complete.

Rollback is straightforward before deletion: revert app/config imports to the old packages. After deletion, rollback requires restoring the old package directories from git.

## Open Questions

- Should the package include a deliberately empty or documentation-only root `@mh/core` export, or should root imports fail to force explicit subpaths?
- Should `@mh/core/data` be considered server-only for now, or allowed as client-safe mock data in tests only?
