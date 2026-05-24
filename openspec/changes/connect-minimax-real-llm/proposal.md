## Motivation

The demo should prove a real local-activity agent loop, not a scripted recommender with LLM wording or JSON-only tool plans. The only acceptable mock boundary is the tool layer: activities, restaurants, availability, delivery, reservations, and messages may be mock data, but the model must choose tools through native OpenAI-compatible tool calls and react to observations.

DeepSeek is available through an OpenAI-compatible endpoint and should power the real demo via `deepseek-v4-pro` with thinking mode enabled.

## Scope

- Extend `@mh/llm` with a native `chatWithTools()` boundary backed by the OpenAI SDK.
- Support `LLM_PROVIDER=deepseek` plus DeepSeek model, thinking, and reasoning settings.
- Convert `@mh/tools` Zod schemas into OpenAI-compatible `tools` definitions.
- Refactor `@mh/agent` planning into a single ReAct loop: model turn, tool execution, observation, repeat, final plan.
- Keep `@mh/tools` as the only mock-data boundary and validate all model-selected tools against the typed registry.
- Preserve the single `/api/chat` SSE interface.
- Add tests that prove tool selection and repair flow through native tool calls, while tool results still come from mock tools.

## Non-Goals

- Do not call real Meituan APIs, payment systems, reservations, delivery, or messaging providers.
- Do not expose API keys to the browser or commit secrets.
- Do not expose raw chain-of-thought in SSE or persisted state.
- Do not add extra frontend APIs for plan, tool, or repair steps.
- Do not require live DeepSeek network access in CI; tests use injected provider doubles.

## User Impact

With DeepSeek configured, the user sees one chat run that reasons through the request, selects tools natively, checks constraints, reacts to unavailable choices, and returns an executable plan for confirmation. If a model-selected tool or final plan is unsafe, the run fails explicitly instead of silently replacing it with a scripted fallback.

## Decisions

- `LLM_PROVIDER=deepseek` fails fast on missing credentials or required provider-output failures.
- `LLM_PROVIDER=auto` prefers DeepSeek credentials, then MiniMax credentials, then fake provider for local/offline demos.
- Planning exposes only discovery and availability tools; execution tools run only after user confirmation.
- Recoverable tool failures are returned as observations for the next ReAct turn.
- Before confirmation, any LLM-generated receipt, succeeded action, or unsupported execution tool is rejected.
