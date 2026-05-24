# Agent Runtime DeerFlow-Lite 重构文档

日期：2026-05-24

## 1. 背景

当前项目是一个全 TypeScript 的本地短时活动规划与执行 Agent MVP。用户通过聊天输入目标，例如“今天下午想和老婆孩子出去玩几个小时，别离家太远”，系统生成一条 4-6 小时的吃喝玩方案，并在用户确认后模拟预约、订位、配送和消息发送。

项目已经具备以下基础能力：

- `apps/web` 提供 Next.js App Router 页面、`/api/chat` SSE 接口，以及 legacy `/api/plan`、`/api/execute` 接口。
- `packages/agent` 提供 LangGraph.js 包装、ReAct 原生工具调用循环、规划和执行入口。
- `packages/tools` 提供 typed tool registry，并用 Zod 校验工具输入输出。
- `packages/shared` 提供跨前后端共享的 Plan、Action、Receipt、StreamEvent 类型。
- `packages/llm` 抽象 OpenAI-compatible native tool calling 和 deterministic fallback。

引入真实 LLM 和聊天工作台之后，架构同时保留了三套思路：

1. 原始 MVP 的显式业务 `StateGraph`，包含 parse、tool、verify、repair、confirmation、execution 等节点。
2. 当前可运行的 ReAct native tool-calling loop，真实规划逻辑集中在 `runReActPlanning`。
3. DeerFlow 风格的单一聊天流，前端主要消费 `/api/chat` 的 SSE 事件。

这三套思路各自合理，但混在一起后出现了边界不清：

- `/api/chat` route 一边负责 HTTP/SSE，一边读取和保存 session，一边通过事件回放重建状态。
- `runChatTurn()` 名义上返回 stream，但 planning 分支会先 `await runPlanning()`，再把完整结果转换成事件。
- LangGraph graph 看起来是运行时主干，但真实模型工具循环隐藏在一个 node 内。
- 确认执行依赖中文 regex，加上 `existingSession.state` 和 `plan` 判断，缺少显式 pending confirmation 状态。
- `/api/plan` 和 `/api/execute` 仍然存在，使产品架构和 demo UI 架构出现两套入口。

DeerFlow 的核心启发不是复制它的 Python Gateway、sandbox、MCP、memory 或 sub-agent 平台能力，而是学习它的运行时边界：

```text
Thread
  owns conversation state and durable artifacts

Run
  owns one active unit of work

Agent runner
  owns model turns, tool calls, safety gates, and state writes

Stream bridge
  decouples runtime producers from SSE consumers

Gateway route
  validates input, starts or joins a run, and streams output
```

本重构目标是做一个 TypeScript-only 的 DeerFlow-lite runtime，让 MVP 保持轻量，同时拥有清晰、可测试、可扩展的 Agent 产品骨架。

## 2. 重构目标

### 2.1 产品目标

- 前端只通过聊天提交目标、修订和确认，不再协调 plan/execute 两个阶段。
- 用户能看到真实运行过程中的规划、工具调用、方案更新、确认请求、执行凭证和错误。
- 确认执行必须安全，不能因为用户一句模糊文本或重复请求造成重复预约。
- demo 仍然保持本地内存和 mock 数据，不引入真实美团 API、真实支付或重型平台基础设施。

### 2.2 工程目标

- 将 `/api/chat` route 缩成薄 HTTP 边界。
- 将 session Map 封装成 `ThreadStore`，后续可替换为 SQLite 或 checkpoint-backed storage。
- 引入 `RunManager` 管理 run 生命周期、并发、取消、幂等和终态。
- 引入 `StreamBridge` 管理 run-scoped 事件发布、订阅、结束和可选重放。
- 将 `runChatTurn()` 改造成真正的 stream-first runner：事件在运行时边界产生，而不是完整结果回放。
- 将 confirmation 改为显式 thread state，而不是 regex-only。
- 保留现有 `@mh/tools` 作为唯一 mock 数据和执行动作边界。

### 2.3 非目标

- 不引入 DeerFlow 的 Python FastAPI Gateway。
- 不引入 sandbox、MCP server、长期 memory、sub-agent、IM channel、多用户 auth。
- 不把 MVP 改成通用 Agent 平台。
- 不要求第一阶段接入持久数据库，但接口要为后续替换留出空间。
- 不改用户侧核心体验：仍然是一个聊天工作台。

## 3. 当前架构

```text
Browser
  |
  v
POST /api/chat
  |
  |-- route loads existing session Map
  |-- route appends local user message
  |-- route calls runChatTurn()
  |-- route applies each event back into session
  |-- route writes SSE frame
  v
runChatTurn()
  |
  |-- if regex confirmation:
  |     executePlan()
  |
  |-- otherwise:
        await runPlanning()
          |
          v
        graph.invoke()
          |
          v
        runReActPlanning()
          |
          |-- model native tool call
          |-- registry tool invoke
          |-- final JSON Plan
          v
        AgentRunOutput
          |
          v
        replay message/tool/plan/confirmation events
```

当前问题可以归纳为三类：

| 问题 | 表现 | 后果 |
| --- | --- | --- |
| Route 过重 | `/api/chat` 同时做验证、状态重建、持久化和 SSE | HTTP 层和 runtime 层难以单测、难以替换 |
| Stream 不是真源头 | 工具事件在 planning 完成后从 trace 回放 | UI 看似实时，实际无法表达真实工具边界 |
| 确认状态弱 | 通过 regex 判断“确认/可以/安排” | 容易误执行，无法做幂等和 revision |

## 4. 目标架构

```text
Browser
  |
  v
POST /api/chat
  |
  |-- validate request body
  |-- create or resume thread
  |-- start run
  |-- return SSE consumer
  v
StreamBridge.subscribe(runId)


Runtime producer
  |
  v
RunManager.start(threadId, userTurn)
  |
  |-- create RunRecord
  |-- resolve idempotency key
  |-- install AbortSignal
  |-- call LocalActivityAgent.streamTurn()
  |-- persist terminal thread and run state
  v
StreamBridge.publish(runId, AgentStreamEvent)


LocalActivityAgent.streamTurn()
  |
  |-- classify current turn against thread state
  |-- plan with native tools, or execute pending confirmation
  |-- publish events at actual boundaries
  |-- write thread state through ThreadStore
```

目标架构的核心原则：

- Route 不拥有业务状态。它只验证请求、启动 run、订阅 stream。
- Runtime 是状态变更源头。messages、plan、pending confirmation、receipts、terminal status 都由 runtime 写入。
- Stream 是运行时事件日志。事件产生在真实边界上，测试可以断言顺序。
- ToolRegistry 是事实边界。模型不能伪造工具结果，receipt 只能来自 execution tool output。
- Thread 和 Run 分离。thread 是会话，run 是一次用户 turn 或一次确认执行 continuation。

## 5. 模块职责

| 模块 | 位置建议 | 拥有职责 | 不拥有职责 |
| --- | --- | --- | --- |
| `POST /api/chat` route | `apps/web/app/api/chat/route.ts` | 请求校验、SSE 响应、断连转取消 | 规划、执行、状态回放 |
| `ThreadStore` | `packages/agent/src/runtime.ts` 或 `apps/web/lib/agentRuntime.ts` | thread state、messages、pending confirmation、plan、receipts、event history | 工具执行 |
| `RunManager` | `packages/agent/src/runtime.ts` | run 创建、状态、幂等、取消、终态记录 | UI 渲染 |
| `StreamBridge` | `packages/agent/src/runtime.ts` | ordered publish/subscribe/end/replay | 业务决策 |
| `LocalActivityAgent` | `packages/agent/src/chatStream.ts` 或新文件 | model loop、tool calls、plan validation、confirmation、execution | HTTP/SSE |
| `ToolRegistry` | `packages/tools/src/registry.ts` | typed tools、input/output validation、handler dispatch | thread/run 状态 |
| `Client state reducer` | `apps/web/lib/chatState.ts` | 根据事件渲染 UI 状态 | 发起 plan/execute 编排 |

第一阶段可以把 `ThreadStore`、`RunManager`、`StreamBridge` 放在一个 `runtime.ts` 内，保持上下文集中。等接口稳定后再拆分文件。

## 6. 核心接口设计

以下是概念接口，不要求逐字实现，但职责边界应保持一致。

### 6.1 ThreadState

```ts
type ThreadState = {
  threadId: string;
  status: "WAITING_FOR_USER" | "READY_FOR_CONFIRMATION" | "DONE" | "PARTIAL_FAILURE";
  messages: AgentMessage[];
  plan?: Plan;
  pendingConfirmation?: PendingConfirmation;
  receipts: ExecutionReceipt[];
  events: AgentStreamEvent[];
  updatedAt: string;
};

type PendingConfirmation = {
  confirmationId: string;
  planId: string;
  plan: Plan;
  allowedActions: PlanAction[];
  status: "pending" | "accepted" | "revised" | "expired";
  createdAt: string;
  expiresAt?: string;
  acceptedRunId?: string;
};
```

设计要点：

- `pendingConfirmation` 必须保存 plan 和 allowed actions，执行时不能重新信任模型输出。
- `status === READY_FOR_CONFIRMATION` 不等于可执行，必须同时存在有效 pending confirmation。
- revision turn 要能把旧 pending confirmation 标为 `revised`，避免 stale actions 被执行。

### 6.2 ThreadStore

```ts
type ThreadStore = {
  create(input: { threadId?: string; now: string }): Promise<ThreadState>;
  get(threadId: string): Promise<ThreadState | undefined>;
  save(thread: ThreadState): Promise<void>;
  appendEvent(threadId: string, event: AgentStreamEvent): Promise<void>;
  appendMessage(threadId: string, message: AgentMessage): Promise<void>;
  setPendingConfirmation(threadId: string, confirmation: PendingConfirmation): Promise<void>;
  clearPendingConfirmation(threadId: string, reason: "accepted" | "revised" | "expired"): Promise<void>;
  appendReceipt(threadId: string, receipt: ExecutionReceipt): Promise<void>;
};
```

MVP 仍然可以是 `Map<string, ThreadState>`。重要的是 API route 不直接操作 Map，也不通过回放事件构造权威状态。

### 6.3 RunRecord

```ts
type RunStatus = "pending" | "running" | "success" | "failed" | "cancelled";

type RunRecord = {
  runId: string;
  threadId: string;
  clientRunId?: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  error?: ToolError;
  abortController: AbortController;
};
```

### 6.4 RunManager

```ts
type RunManager = {
  start(input: {
    threadId: string;
    clientRunId?: string;
    message: string;
    now: string;
  }): Promise<RunRecord>;
  get(runId: string): Promise<RunRecord | undefined>;
  findByClientRunId(threadId: string, clientRunId: string): Promise<RunRecord | undefined>;
  markRunning(runId: string): Promise<void>;
  markSuccess(runId: string): Promise<void>;
  markFailed(runId: string, error: ToolError): Promise<void>;
  cancel(runId: string, reason?: string): Promise<void>;
};
```

幂等规则：

- 同一个 `threadId + clientRunId` 重复提交时，不应创建第二个执行 run。
- planning 重复提交可复用或重放同一个 run 的事件。
- confirmation 重复提交必须禁止重复执行 action。

### 6.5 StreamBridge

```ts
type StreamBridge = {
  publish(runId: string, event: AgentStreamEvent): Promise<void>;
  publishEnd(runId: string): Promise<void>;
  subscribe(runId: string, options?: { lastEventId?: string }): AsyncIterable<AgentStreamEvent | StreamEnd>;
};
```

第一阶段可以只保留 run-scoped in-memory buffer：

- 每个 run 一个事件数组。
- `publish` 按顺序追加并唤醒订阅者。
- `subscribe` 从 retained buffer 起点开始读取。
- `publishEnd` 发送 stream 终止信号。
- 可选：给事件增加 run 内递增 `sequence`，方便测试和 replay。

### 6.6 LocalActivityAgent

```ts
type LocalActivityAgent = {
  streamTurn(input: {
    thread: ThreadState;
    run: RunRecord;
    message: string;
    now: string;
    abortSignal: AbortSignal;
  }): AsyncIterable<AgentStreamEvent>;
};
```

`LocalActivityAgent` 是业务 runtime。它不需要知道 HTTP，也不需要知道 React。它只拿 thread/run/input，产出事件，并通过 stores 写入状态。

## 7. Event Protocol

保留现有 `AgentStreamEvent` 的主体结构，但强化事件语义。

### 7.1 事件产生时机

| Event | 产生边界 |
| --- | --- |
| `thread.created` | thread id 创建并写入 ThreadStore 后 |
| `message.delta` | assistant 内容可展示时；若供应商不支持 token stream，可以一次性发完整 delta |
| `message.completed` | assistant message 写入 thread state 后 |
| `agent.step` | runtime 进入或完成 planning/tooling/verification/confirmation/execution/final |
| `tool.started` | registry tool invoke 前一刻 |
| `tool.finished` | registry tool invoke 成功或失败后一刻 |
| `plan.updated` | Plan schema 和 safety validation 通过后 |
| `confirmation.required` | pending confirmation 写入 ThreadStore 后 |
| `execution.receipt` | execution tool 返回 schema-valid receipt 后 |
| `run.failed` | runtime 捕获不可恢复错误并标准化后 |
| `run.completed` | terminal thread state 和 run state 都写入后 |

### 7.2 事件顺序约束

- `thread.created` 只在新 thread 的第一个 run 中出现，且应早于业务事件。
- 每个 `tool.started` 必须早于同 `toolCallId` 的 `tool.finished`。
- `plan.updated` 必须早于对应 `confirmation.required`。
- `execution.receipt` 只能出现在确认执行路径。
- `run.failed` 和 `run.completed` 都是 terminal event。terminal event 后不得再发布业务事件。
- 如果发生失败，优先发布 `run.failed`，然后结束 stream；是否额外发布 `run.completed` 应统一决定。推荐第一阶段选择一种 terminal 语义：`run.completed` 表示 success，`run.failed` 表示 failure，不双发。

## 8. 主要流程

### 8.1 新规划 turn

```text
User message
  |
  v
/api/chat validates body
  |
  v
ThreadStore.create()
  |
  v
RunManager.start()
  |
  v
SSE subscribes to StreamBridge
  |
  v
LocalActivityAgent.streamTurn()
  |
  |-- thread.created
  |-- agent.step(planning/running)
  |-- model native tool call
  |-- tool.started
  |-- ToolRegistry.invoke()
  |-- tool.finished
  |-- repeat until final JSON
  |-- validate Plan
  |-- persist plan and pending confirmation
  |-- message.delta + message.completed
  |-- plan.updated
  |-- confirmation.required
  |-- run.completed
```

### 8.2 确认执行 turn

```text
User: 确认，就按这个安排
  |
  v
ThreadStore.get(threadId)
  |
  v
Runtime checks:
  - thread has valid pendingConfirmation
  - user intent is confirm
  - clientRunId is not already executed
  |
  v
execute allowedActions
  |
  |-- agent.step(execution/running)
  |-- tool.started
  |-- execution tool invoke
  |-- tool.finished
  |-- receipt validated
  |-- execution.receipt
  |-- action marked succeeded
  |-- pendingConfirmation accepted
  |-- run.completed
```

### 8.3 修订 turn

```text
User: 换个清淡一点、预算低一点的餐厅
  |
  v
Thread has pendingConfirmation
  |
  v
Intent classified as revision
  |
  |-- mark old pendingConfirmation as revised
  |-- re-enter planning path with previous plan as context
  |-- produce new plan.updated
  |-- create new pendingConfirmation
```

### 8.4 模糊 turn

```text
User: 也行吧
  |
  v
Thread has pendingConfirmation
  |
  v
Intent confidence is low
  |
  |-- do not execute
  |-- ask concise clarification
  |-- keep pendingConfirmation active
```

## 9. ReAct Loop 重构策略

本 MVP 不建议第一阶段拆成很多 LangGraph nodes。原因：

- 当前 native tool calling loop 已经能跑真实 LLM。
- 显式图重写会扩大改动面，可能影响 hackathon demo 稳定性。
- 真正的问题不是“没有图”，而是事件和状态边界没有在 loop 中显式表达。

推荐保留 ReAct loop，但把它从“返回 AgentRunOutput 的 node”升级为“可插桩的 stream-first runner”。

### 9.1 当前 loop

```text
runReActPlanning(state)
  |
  |-- client.chatWithTools()
  |-- tracedToolCall()
  |-- collect traces
  |-- parse final JSON
  |-- return Partial<AgentGraphState>
```

### 9.2 目标 loop

```text
planWithNativeTools(input, runtime)
  |
  |-- emit agent.step(planning/running)
  |-- client.chatWithTools()
  |-- for each tool call:
        emit tool.started
        registry.invoke
        emit tool.finished
        append observation
  |-- parse final JSON
  |-- validate final Plan
  |-- emit plan.updated
  |-- return validated plan + assistant text
```

建议把工具调用函数从 `tracedToolCall()` 扩展为接受 runtime hooks：

```ts
type ToolCallHooks = {
  onToolStarted(trace: ToolCallTrace): Promise<void>;
  onToolFinished(trace: ToolCallTrace): Promise<void>;
};
```

或者直接将 `StreamBridge.publish` 注入 agent runner，避免工具 helper 依赖 HTTP。

## 10. Confirmation 安全模型

确认执行必须满足三个条件：

1. Thread 有有效 `pendingConfirmation`。
2. 当前用户 turn 被解释为确认，而不是修订或模糊回复。
3. 要执行的 action 必须来自 pending confirmation 的 `allowedActions`。

### 10.1 Intent 分类

第一阶段可以用一个小函数，结合规则和 LLM fallback：

```ts
type ConfirmationIntent =
  | { type: "confirm"; confidence: number }
  | { type: "revise"; confidence: number; reason: string }
  | { type: "ambiguous"; confidence: number };
```

规则优先：

- 明确确认词：`确认`、`就按这个`、`可以安排`、`开始预约`。
- 明确修订词：`换`、`改`、`不要`、`预算`、`时间`、`餐厅`、`活动`、`远一点`、`近一点`。
- 命中修订词时不能执行，即使命中确认词。

当规则无法判断时，模型可以分类，但执行仍要求 pending state 存在。

### 10.2 Action 幂等

执行 action 前检查：

- 相同 `clientRunId` 是否已经开始或完成。
- action 是否已经有 successful receipt。
- pending confirmation 是否已经 accepted。

如果 action 已完成，直接复用 receipt，不重新调用 execution tool。

### 10.3 Receipt 来源

Receipt 只能来自 execution tool output：

- planning 阶段如果模型输出 `receipt`、`订单号`、`succeeded action`，应触发 validation error。
- execution 阶段 tool output 必须通过 `ExecutionReceiptSchema`。
- `execution.receipt` event 必须和 action id 建立关联。若当前 `ExecutionReceipt` 没有 action id，可以在内部用 map 保存。

## 11. Legacy Route 策略

`/api/plan` 和 `/api/execute` 不再作为产品主路径。

推荐阶段性处理：

1. 保留接口，标注 legacy compatibility。
2. 如果测试依赖它们，改为薄 wrapper，内部调用同一个 runtime。
3. 前端 ChatWorkspace 不再调用它们。
4. Workbench 如果保留为开发调试页，也应标注 legacy 或迁移到 `/api/chat`。
5. 文档中不再把 `/api/plan`、`/api/execute` 描述为主架构。

最终产品入口：

```text
Primary:
  POST /api/chat

Legacy:
  POST /api/plan
  POST /api/execute
```

## 12. 文件级重构建议

### 12.1 新增或调整

| 文件 | 改动 |
| --- | --- |
| `packages/agent/src/runtime.ts` | 定义 in-memory `ThreadStore`、`RunManager`、`StreamBridge`、runtime factory |
| `packages/agent/src/chatStream.ts` | 改为使用 runtime services 和 stream-first agent runner |
| `packages/agent/src/nodes/runReActPlanning.ts` | 抽出可流式发布工具事件的 ReAct loop，或改名为 `planWithNativeTools` |
| `apps/web/app/api/chat/route.ts` | 只做 request validation、run start、SSE subscribe、disconnect cancel |
| `apps/web/lib/sessionStore.ts` | 删除或迁移为 `ThreadStore` 的 web singleton wrapper |
| `apps/web/lib/chatState.ts` | 保持 client-side reducer，只渲染事件 |
| `packages/shared/src/index.ts` | 补充 pending confirmation、run status、可选 sequence/idempotency 字段 |

### 12.2 暂不优先

| 文件或能力 | 处理 |
| --- | --- |
| 旧 explicit planning nodes | 第一阶段先保留，等 stream-first runner 稳定后删除或 quarantine |
| `/api/plan`、`/api/execute` | 先 legacy wrapper，后续移除 |
| 持久化数据库 | 第一阶段不做，只保证接口可替换 |
| LangGraph checkpoint | 暂不接入，避免和 MVP runtime 同时重构 |

## 13. 迁移计划

### Phase 0: Baseline

- 确认当前 family/friends 两个 demo flow 可运行。
- 固定当前 event contract 测试，防止 UI 渲染断裂。
- 记录 legacy `/api/plan`、`/api/execute` 当前行为，作为兼容参照。

### Phase 1: Runtime services

- 新增 `ThreadStore`，把 `sessionStore` 的 Map 行为迁进去。
- 新增 `RunManager`，支持 create/get/status/cancel/clientRunId lookup。
- 新增 `StreamBridge`，支持 publish/subscribe/publishEnd。
- 为三个 service 写 unit tests。

验收：

- 不改变 UI 行为。
- `/api/chat` 仍能返回相同类型的 SSE event。
- Thread state 可以通过 store 查询。

### Phase 2: Thin chat route

- `/api/chat` route 不再 `applyEvent()` 重建 session。
- route 调用 runtime start run，并订阅 `StreamBridge`。
- route 断连时调用 `RunManager.cancel()`。
- pre-stream validation error 仍返回 JSON 400。
- stream 内部错误由 runtime 发布 `run.failed`。

验收：

- route 测试证明 route 不直接做 planning 或 execution。
- route 测试证明断连会触发 cancel。

### Phase 3: Stream-first planning

- 重构 ReAct loop，让 tool events 在 registry invoke 前后实时发布。
- 保留 native tool calling 和现有 plan safety validation。
- 将 `runChatTurn()` 中 “await runPlanning then replay traces” 的路径替换掉。

验收：

- 测试中可观察到 `tool.started` 在 tool handler 完成前已经发布。
- recoverable tool failure 仍作为 observation 回到模型。
- unsafe plan 仍被拒绝。

### Phase 4: Confirmation state

- 在 `confirmation.required` 前写入 `pendingConfirmation`。
- 替换 regex-only 确认检测。
- 支持 confirm、revise、ambiguous 三类 turn。
- 对 duplicate `clientRunId` 和 duplicate action 做幂等。

验收：

- 没有 pending confirmation 时，即使用户说“确认”，也不会执行。
- revision turn 不会执行 stale plan。
- 重复确认不会生成重复 receipt。

### Phase 5: Legacy cleanup

- 前端只走 `/api/chat`。
- `/api/plan`、`/api/execute` 标注 legacy 或改为 wrapper。
- 更新 `docs/mvp-agent-loop-architecture.md`，避免描述旧主架构。
- 删除或隔离不再使用的旧 graph nodes。

验收：

- family/friends demo flow 只依赖 `/api/chat`。
- 旧文档和新 OpenSpec 不冲突。

## 14. 测试计划

### 14.1 Unit tests

- `ThreadStore`
  - create/get/save thread。
  - set/clear pending confirmation。
  - append receipt。
  - append event order。

- `RunManager`
  - create run。
  - duplicate clientRunId lookup。
  - status transition。
  - cancel sets abort signal。
  - terminal state cannot be overwritten unexpectedly。

- `StreamBridge`
  - publish order。
  - subscriber receives retained events。
  - publishEnd closes stream。
  - multiple subscribers see same event order。

### 14.2 Agent tests

- planning emits `agent.step(planning/running)` before model loop finishes。
- each registry invocation emits `tool.started` before handler and `tool.finished` after handler。
- recoverable tool error becomes model observation。
- non-recoverable tool error emits `run.failed`。
- model-fabricated receipt is rejected。

### 14.3 Confirmation tests

- confirm with pending state executes actions。
- confirm without pending state does not execute。
- revision clears stale pending confirmation and replans。
- ambiguous reply asks clarification。
- duplicate confirmation reuses receipt。

### 14.4 API tests

- invalid request returns JSON 400 before stream starts。
- valid request starts a run and streams events。
- route does not reconstruct authoritative session state。
- client disconnect cancels active planning run。
- terminal event ordering is stable。

### 14.5 Integration smoke

- family prompt -> plan -> confirmation -> receipts。
- friends prompt -> plan -> confirmation -> receipts。
- unavailable or long queue tool result -> alternative or repair。
- partial failure path renders useful error。

## 15. 验收标准

重构完成后，系统应满足：

- `/api/chat` 是唯一主产品编排入口。
- 新用户消息会创建或恢复 thread，并创建 run。
- `tool.started` 和 `tool.finished` 在真实工具调用边界产生。
- planning 不再先完整阻塞再回放 trace 作为主要 stream 机制。
- pending confirmation 存在于 thread state 中。
- confirmation execution 同时要求 pending state 和确认意图。
- duplicate `clientRunId` 或重复确认不会重复执行 action。
- receipt 只能来自 execution tool output。
- API route 不再直接拥有 session state reconstruction。
- tests 覆盖 runtime services、stream ordering、confirmation safety 和 chat SSE。

## 16. 风险和缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 过度复制 DeerFlow | MVP 变重，开发速度下降 | 只复制 thread/run/stream boundary，不复制 sandbox/MCP/memory |
| stream-first 改动破坏 UI | demo 不稳定 | 保留现有 event names，先加 reducer 测试 |
| confirmation 分类误判 | 误执行或无法执行 | pending state 必须存在；修订词优先；模糊时询问 |
| 幂等遗漏 | 重复 receipt | clientRunId + action receipt 双层检查 |
| 旧 graph nodes 混淆 | 维护者不知主路径 | 文档标注主路径，后续删除或 quarantine |
| in-memory runtime 丢状态 | 刷新或重启后丢 thread | MVP 可接受；接口预留持久化替换 |

## 17. 推荐实施顺序

优先级从高到低：

1. `ThreadStore`、`RunManager`、`StreamBridge` 三个 runtime service。
2. `/api/chat` route 瘦身。
3. ReAct loop 实时发布 tool events。
4. pending confirmation 状态和确认分类。
5. duplicate confirmation 和 receipt 幂等。
6. legacy plan/execute 文档和代码清理。
7. 旧 graph nodes quarantine。

这条顺序的好处是每一步都能保持 demo 可运行，且每一步都能独立测试。

## 18. 和 DeerFlow 的对应关系

| DeerFlow | 本项目 DeerFlow-lite |
| --- | --- |
| FastAPI Gateway route | Next.js `/api/chat` route |
| `RunManager` | TS in-memory `RunManager` |
| `StreamBridge` | TS in-memory `StreamBridge` |
| LangGraph `agent.astream()` worker | `LocalActivityAgent.streamTurn()` |
| Thread checkpoint/state | `ThreadStore` |
| Run event store/journal | `ThreadState.events` 或 run-scoped event buffer |
| Tool loading/MCP/sandbox | `@mh/tools` typed registry |
| Middleware chain | 轻量 runtime hooks：tool tracing、confirmation、safety、idempotency |

明确不复制：

- Python Gateway。
- sandbox lifecycle。
- MCP server 管理。
- long-term memory。
- sub-agent delegation。
- multi-channel IM。
- multi-user auth 和权限系统。

## 19. 最终架构一句话

本项目应该从“API route 调用 agent 并回放结果”重构为“route 启动 run 并订阅 stream，runtime 拥有 thread/run/state/tool/safety，UI 只渲染事件”的 DeerFlow-lite 架构。

