## Current Shape

The MVP previously used a structured JSON LLM boundary:

- `parseGoal` asked the model for a goal hint.
- `planToolCalls` asked the model to return a JSON list of tool calls.
- `callTools` executed that list through the mock registry.
- `composePlan`, `verifyPlan`, and `repairPlan` asked for more JSON decisions.

That removed the old family/friends hard-coding, but it was still not a true ReAct runtime. The agent graph orchestrated separate planning phases instead of letting the model natively decide action/observation loops through provider tool calls.

## Target Shape

```text
Next.js route /api/chat
  │
  ▼
@mh/agent runChatTurn
  │
  ▼
LangGraph run
  ├─ runReActPlanning
  │   ├─ model turn with native tools
  │   ├─ execute selected registry tools
  │   ├─ append tool observations
  │   ├─ repeat until final JSON plan or failure
  │   └─ validate final plan safety
  └─ waitForConfirmation
```

The browser still calls only `/api/chat`. The backend run now owns a single ReAct loop: the model receives OpenAI-compatible `tools`, selects tool calls natively, observes registry outputs, repairs from recoverable failures, and eventually returns a final executable plan. Tools can still return mock data and mock receipts; the planning graph no longer contains a JSON tool-planning phase, scenario-specific tool chain, static plan, separate LLM verification node, or hard-coded repair node.

## LLM Client Contract

The app-level LLM interface now exposes provider-native tool calling:

```ts
type LLMClient = {
  provider: "fake" | "minimax" | "deepseek";
  chatWithTools(input: {
    messages: NativeChatMessage[];
    tools: NativeToolDefinition[];
  }): Promise<{
    content: string;
    toolCalls: NativeToolCall[];
    finishReason?: string;
  }>;
};
```

Legacy structured helpers may remain temporarily for compatibility tests, but the planning graph does not call them. DeepSeek uses the official OpenAI-compatible SDK shape with `baseURL=https://api.deepseek.com`, `model=deepseek-v4-pro`, `thinking.type`, `reasoning_effort`, and native `tools/tool_choice`. MiniMax can remain as an OpenAI-compatible provider, but the preferred live demo provider is DeepSeek when `DEEPSEEK_API_KEY` is configured.

## Tool Boundary

`@mh/tools` is the only layer allowed to contain mock local-business data:

- discovery tools return mock activities, restaurants, products, profile, and travel estimates;
- availability tools return success or recoverable failures such as `NO_AVAILABILITY`;
- execution tools return mock receipts only after user confirmation.

During planning, only discovery and availability tools are exposed to the ReAct model. Execution tools such as `bookActivity`, `reserveRestaurant`, `scheduleDelivery`, and `sendMessage` are not included in the planning `tools` list; they may only appear as pending `requiredActions` in the final plan and are executed by the confirmation path.

## Safety Rules

- Model tool calls must match the exported registry allowlist.
- Tool inputs are parsed by the tool Zod schema before invocation.
- Unknown tools and non-recoverable validation failures surface as failed traces and `run.failed`.
- Recoverable tool failures are returned as tool observations so the model can query alternatives.
- The ReAct loop has a maximum turn count to prevent runaway planning.
- Final plans must parse through `PlanSchema`.
- Plan actions must stay `pending` before confirmation.
- Plan actions must not include receipts, order IDs, payment states, or successful statuses.
- Required action `toolName` values may only be `bookActivity`, `reserveRestaurant`, `scheduleDelivery`, or `sendMessage`.
- Raw reasoning is not streamed; SSE carries concise step summaries, tool traces, plan updates, confirmation, receipts, and failures.

## Streaming

The existing SSE contract remains intact:

- `agent.step` announces the planning run and execution run.
- `tool.started` and `tool.finished` reflect registry invocations selected by native tool calls.
- `plan.updated` is sent only after schema and safety checks.
- `confirmation.required` is emitted before any execution action.
- `run.failed` is emitted for illegal tools, invalid model output, unsafe plans, loop limits, or required LLM failures.

## Provider Configuration

Use server-side environment variables only:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_PROVIDER` | `auto` | `auto`, `fake`, `deepseek`, or `minimax` |
| `DEEPSEEK_API_KEY` | none | Secret DeepSeek API key, never committed |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | OpenAI-compatible DeepSeek endpoint |
| `DEEPSEEK_MODEL` | `deepseek-v4-pro` | DeepSeek model name |
| `DEEPSEEK_THINKING` | `enabled` | DeepSeek thinking mode toggle |
| `DEEPSEEK_REASONING_EFFORT` | `high` | DeepSeek reasoning effort, `high` or `max` |
| `MINIMAX_API_KEY` | none | Optional MiniMax API key |
| `MINIMAX_BASE_URL` | `https://api.minimaxi.com/v1` | Optional MiniMax OpenAI-compatible endpoint |
| `MINIMAX_MODEL` | `MiniMax-M2.7` | Optional MiniMax model name |
| `LLM_TIMEOUT_MS` | `12000` | Per-call timeout budget |
| `LLM_MAX_RETRIES` | `1` | Short retry budget |
| `LLM_MAX_TOKENS` | `4096` | Per-call completion cap |

`auto` prefers DeepSeek when `DEEPSEEK_API_KEY` is present, then MiniMax when `MINIMAX_API_KEY` is present, then fake provider for offline demos. Explicit live providers require credentials and fail fast if they are missing.

## Testing Strategy

- Unit-test DeepSeek native tool-calling request construction through an injected OpenAI-compatible invoker.
- Unit-test ReAct-selected tool calls and final plans in `@mh/agent`.
- Unit-test ReAct repair after a failed restaurant availability observation.
- Unit-test illegal native tool names produce failed traces without invoking real tools.
- Unit-test unsafe final plans with receipts or succeeded actions are rejected.
- Keep `/api/chat` as the only frontend API and verify SSE still includes tool events, plan updates, confirmation, and completion.
