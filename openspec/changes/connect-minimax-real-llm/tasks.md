## 1. Provider Configuration

- [x] 1.1 Add server-only LLM config parsing in `@mh/llm`.
- [x] 1.2 Support `LLM_PROVIDER=auto|fake|minimax|deepseek`.
- [x] 1.3 Support `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_THINKING`, and `DEEPSEEK_REASONING_EFFORT`.
- [x] 1.4 Keep MiniMax config as an optional OpenAI-compatible provider.
- [x] 1.5 Add `.env.example` documentation with placeholders only.

## 2. Native Tool-Calling LLM Boundary

- [x] 2.1 Add `chatWithTools()` to the app-level `LLMClient`.
- [x] 2.2 Add `DeepSeekLLMClient` backed by the official OpenAI SDK.
- [x] 2.3 Pass `deepseek-v4-pro`, thinking mode, reasoning effort, native `tools`, and `tool_choice=auto`.
- [x] 2.4 Parse provider-native tool calls into app `NativeToolCall` values.
- [x] 2.5 Keep `FakeLLMClient` for tests/offline demos only.

## 3. Tool Boundary

- [x] 3.1 Convert `@mh/tools` Zod input schemas into OpenAI-compatible tool definitions.
- [x] 3.2 Expose only discovery and availability tools during planning.
- [x] 3.3 Keep booking, reservation, delivery, and message tools for post-confirmation execution only.
- [x] 3.4 Validate all native tool-call inputs through the existing registry before invocation.

## 4. ReAct Agent Loop

- [x] 4.1 Replace the planning graph chain with a single `runReActPlanning` node.
- [x] 4.2 Remove graph dependence on JSON `planToolCalls`, `composePlan`, `verifyPlan`, and `repairPlan` phases.
- [x] 4.3 Feed recoverable tool failures back as observations for subsequent model turns.
- [x] 4.4 Enforce max loop count, unknown-tool rejection, and non-recoverable validation failure handling.
- [x] 4.5 Parse and safety-check the final plan before emitting `plan.updated`.

## 5. Safety and Streaming

- [x] 5.1 Reject unsafe final plans that include receipts, succeeded actions, or unsupported execution tools.
- [x] 5.2 Preserve the single `/api/chat` SSE interface.
- [x] 5.3 Emit tool events from actual registry invocations selected by native tool calls.
- [x] 5.4 Emit `run.failed` for illegal tools, unsafe plans, invalid final JSON, loop limits, or required LLM failures.

## 6. Verification

- [x] 6.1 Add provider tests for DeepSeek native tool-call request construction.
- [x] 6.2 Add agent tests for ReAct-selected tool calls and final plans.
- [x] 6.3 Add agent tests for ReAct repair after unavailable restaurant time.
- [x] 6.4 Add agent tests for illegal native tool names.
- [x] 6.5 Add agent tests for unsafe pre-confirmation receipts/actions.
- [x] 6.6 Run `pnpm check`.
- [x] 6.7 Run `pnpm test`.
- [x] 6.8 Run `pnpm build`.
- [x] 6.9 Run `openspec validate --all`.
- [x] 6.10 Smoke-test `/api/chat` with local DeepSeek credentials if available.
