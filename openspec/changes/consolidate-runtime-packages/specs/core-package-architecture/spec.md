## ADDED Requirements

### Requirement: Single Core Runtime Package

The system SHALL consolidate the runtime workspace packages into one `@mh/core` package while preserving logical runtime areas through subpath exports.

#### Scenario: Runtime package exposes explicit areas

- **WHEN** code imports runtime modules after the migration
- **THEN** it SHALL import them from `@mh/core/agent`, `@mh/core/llm`, `@mh/core/tools`, `@mh/core/data`, or `@mh/core/shared`

#### Scenario: Old runtime packages are removed from active workspace config

- **WHEN** package manifests and workspace config are inspected after the migration
- **THEN** they SHALL NOT depend on `@mh/agent`, `@mh/llm`, `@mh/tools`, `@mh/data`, or `@mh/shared`

### Requirement: Client Safe Shared Entrypoint

The system SHALL keep shared SSE schemas, artifact contracts, and UI-safe types available from `@mh/core/shared` without importing server-only runtime code.

#### Scenario: Client code imports shared contracts

- **WHEN** client components or client-side state helpers need stream event or artifact types
- **THEN** they SHALL import those contracts from `@mh/core/shared`

#### Scenario: Shared entrypoint remains server dependency free

- **WHEN** `@mh/core/shared` is evaluated as a dependency boundary
- **THEN** it SHALL NOT import `@mh/core/agent`, `@mh/core/llm`, `@mh/core/tools`, OpenAI SDKs, LangChain runtime wrappers, or tool execution registries

### Requirement: Server Runtime Boundaries

The system SHALL keep agent, LLM, tool, and data runtime code behind server-oriented subpath imports.

#### Scenario: Chat route uses consolidated agent runtime

- **WHEN** `/api/chat` starts or resumes a run
- **THEN** it SHALL import agent runtime behavior from `@mh/core/agent`

#### Scenario: Cross-area runtime imports remain explicit

- **WHEN** one runtime area depends on another area
- **THEN** it SHALL import through an explicit `@mh/core/<area>` subpath rather than an old package name

### Requirement: Tooling Supports Consolidated Package

The system SHALL update development tooling so tests, typechecks, linting, and Next.js compilation resolve the consolidated package consistently.

#### Scenario: Next transpiles only the consolidated runtime package

- **WHEN** the web app Next configuration is inspected
- **THEN** runtime package transpilation SHALL reference `@mh/core` instead of the removed runtime packages

#### Scenario: Tests resolve subpath imports

- **WHEN** Vitest runs package and app tests
- **THEN** aliases or package exports SHALL resolve each `@mh/core/<area>` subpath without requiring the old package names

### Requirement: Behavior Parity

The system SHALL preserve current agent, SSE, mock data, and frontend behavior during the package consolidation.

#### Scenario: Existing runtime tests still pass

- **WHEN** the migrated package structure is verified
- **THEN** existing tests for chat streaming, tool summaries, runtime convergence, shared stream events, and frontend state SHALL pass without behavior rewrites

#### Scenario: Stale package imports are absent from active source

- **WHEN** active source and config files are searched after migration
- **THEN** they SHALL NOT contain imports from `@mh/agent`, `@mh/llm`, `@mh/tools`, `@mh/data`, or `@mh/shared`
