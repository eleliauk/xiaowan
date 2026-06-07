# 本地场景短时活动规划与执行 Agent 技术文档

## 1. 项目目标与交付形态

本项目构建一个本地场景短时活动规划与执行 Agent。用户输入一句自然语言目标，例如“今天下午想和老婆孩子出去玩几个小时，别离家太远”，系统自动理解出行场景、同行人、时间窗口和偏好，通过工具查询本地活动、餐厅、路程、可用性与排队情况，生成一份可确认的完整方案，并在用户确认后执行关键 Mock 动作，如预约活动、预订餐厅、发送消息或安排配送。

PRD 来源：[飞书 Wiki](https://my.feishu.cn/wiki/A5wuwi7ariWiWAkE9RGcfCrQnch)。

Demo 形态为 Web UI：`apps/web` 提供聊天工作区和方案产物面板，`POST /api/chat` 通过 SSE 流式返回 Agent 进展、工具调用、方案文档、确认请求和执行回执。默认可用 `LLM_PROVIDER=fake` 跑完整闭环，也支持 DeepSeek / MiniMax 配置。

## 2. 系统架构

```txt
User
  -> apps/web ChatWorkspace
  -> /api/chat SSE route
  -> @mh/core/agent runtime
  -> @mh/core/llm
  -> @mh/core/tools
  -> @mh/core/data mock catalog
  -> @mh/core/shared event schemas
```

核心目录：

- `apps/web/components/ChatWorkspace.tsx`：聊天、执行步骤、方案产物、确认入口。
- `apps/web/app/api/chat/route.ts`：SSE 接口。
- `apps/web/lib/chatState.ts`：前端流事件折叠。
- `packages/core/src/agent`：规划循环、确认执行、artifact 渲染、运行时状态。
- `packages/core/src/tools`：Tool Registry 和 Mock API 工具。
- `packages/core/src/data`：活动、餐厅、商品、用户画像等 Mock 数据。
- `packages/core/src/shared`：Plan、Artifact、Receipt、SSE Event 等共享契约。

## 3. Planning 策略

Agent 使用 ReAct 风格规划，但由运行时加收敛约束，避免模型无限调用工具。

1. **意图理解**：从用户输入中识别场景，当前主要支持亲子半日和朋友局两类本地短时活动。
2. **事实收集**：LLM 通过工具查询用户画像、附近活动、餐厅候选、路程、活动名额、餐厅桌位、排队时长等事实。
3. **方案验证**：运行时要求输出结构化 `Plan`，包含时间线、预算、风险、需要确认后执行的动作。
4. **收敛控制**：重复工具调用会被 fingerprint 跳过；单工具调用次数有限制；当已有事实足够时，运行时可从成功 traces 合成正常方案。
5. **文档生成**：Markdown artifact 由结构化 Plan 确定性渲染，不再让 LLM 生成最终文档，降低 JSON/schema 失败对用户输出的影响。
6. **确认后执行**：规划阶段不能执行预约、订位、下单或发消息；这些动作只作为 `requiredActions` 等待用户确认。

正常规划事件顺序：

```txt
plan.updated -> artifact.updated(draft) -> confirmation.required -> run.completed(READY_FOR_CONFIRMATION)
```

确认执行事件顺序：

```txt
execution.receipt* -> artifact.updated(final) -> run.completed(DONE)
```

## 4. Tool 与 Mock API 链路

Tool 入口在 `packages/core/src/tools/index.ts`，通过 `createDefaultToolRegistry()` 注册。所有工具都有 Zod 输入/输出 schema，并通过 Mock 数据模拟真实 API。

| 阶段 | Tool | 作用 |
| --- | --- | --- |
| 用户上下文 | `getUserProfile` | 获取家庭成员、朋友成员、联系人、家庭位置 |
| 候选发现 | `searchNearbyActivities` | 按场景、标签、半径查询活动候选 |
| 候选发现 | `searchRestaurants` | 按场景、人数、偏好查询餐厅 |
| 路程评估 | `estimateTravelTime` | 根据地点坐标估算距离和通行时间 |
| 可用性校验 | `checkActivityAvailability` | 校验活动时间段名额和价格 |
| 可用性校验 | `checkRestaurantAvailability` | 校验指定时间和人数桌位 |
| 风险校验 | `checkQueueTime` | 校验餐厅预计排队时长 |
| 加购候选 | `searchAddOnProducts` | 查询可配送的可选商品 |
| 确认执行 | `bookActivity` | 生成活动预约回执 |
| 确认执行 | `reserveRestaurant` | 生成餐厅订位回执 |
| 确认执行 | `scheduleDelivery` | 生成配送安排回执 |
| 确认执行 | `sendMessage` | 生成消息发送回执 |

Mock API 失败会抛出 `ToolExecutionError`，包含 `code`、`message`、`recoverable` 和可选 `suggestedFallback`。例如活动无名额返回 `NO_AVAILABILITY`，排队过长返回 `QUEUE_TOO_LONG`，配送窗口不可用返回 `DELIVERY_UNAVAILABLE`。

## 5. 确认与执行机制

规划产出的 `Plan.requiredActions` 是延迟动作，不会在规划阶段执行。当前端收到 `confirmation.required` 后，用户可以确认或要求调整。确认请求再次通过同一个 `/api/chat` 进入 runtime，runtime 只有在当前线程存在 pending confirmation 且用户意图为确认时，才调用 `executeActions()`。

执行阶段逐个调用 `requiredActions` 中的工具，并生成 `ExecutionReceipt`。回执会写回最终 Markdown artifact，使用户看到“方案 + 执行结果”的完整闭环。

## 6. 异常处理机制

- **模型或供应商失败**：统一流出 `run.failed`，UI 保留已有对话和诊断信息。
- **工具可恢复失败**：作为 observation 回传给规划循环，允许模型换时间、换餐厅或生成风险提示。
- **工具不可恢复失败**：终止本轮或进入部分失败状态。
- **重复/过量工具调用**：运行时跳过并记录 `tool.finished(status=skipped)`。
- **候选事实不足**：使用已有成功 traces 合成兜底方案，并在 artifact 中展示风险与备选。
- **确认前安全边界**：执行类工具不暴露给规划阶段，避免模型提前下单或伪造回执。
- **执行部分失败**：可选动作可跳过，必需动作失败时标记 `PARTIAL_FAILURE` 并保留诊断。

## 7. 运行方式

```bash
pnpm install
LLM_PROVIDER=fake pnpm dev
```

常用验证：

```bash
pnpm test
pnpm typecheck
pnpm check
```

重点测试覆盖 SSE 合约、规划收敛、确认执行、前端状态折叠和 API 事件顺序。
