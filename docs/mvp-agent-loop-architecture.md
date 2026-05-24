# 本地短时活动规划与执行 Agent MVP 架构

日期：2026-05-24

## 1. 项目目标

构建一个全 TypeScript 的 monorepo Demo：用户输入一句自然语言目标，例如“今天下午想和老婆孩子出去玩几个小时，别离家太远”，系统在数分钟内生成一条 4-6 小时的本地吃喝玩综合方案，并在用户确认后模拟完成预约、购票、排队判断、配送和消息通知。

这个 MVP 要证明的不是“搜索推荐”，而是“规划 + 校验 + 执行”的闭环能力：

- 能理解自然语言中的时间、地点、人群、偏好和隐含约束。
- 能调用工具查询活动、餐厅、排队、座位、配送等信息。
- 能生成可执行的时间线计划。
- 能在确认后触发关键动作，并返回执行凭证。
- 能处理工具失败、无座位、排队过长、时间冲突等异常。

## 2. MVP 范围

### 必做场景

1. 家庭场景
   - 成员：小明、老婆、5 岁孩子。
   - 约束：离家不远，适合儿童，老婆最近减肥，尽量少排队。
   - 示例路线：亲子乐园/儿童剧/手作馆 -> 健康餐厅 -> 饭后散步/甜品。

2. 朋友场景
   - 成员：4 人，2 男 2 女。
   - 约束：下午 4-6 小时，适合社交，餐厅氛围好，有饭前或饭后活动。
   - 示例路线：展览/citywalk/桌游 -> 聚餐 -> 小吃街/酒吧/甜品。

### 暂不做

- 真实支付。
- 真实美团 API 对接。
- 多轮复杂讨价还价。
- 真实地图路径规划。
- 复杂用户画像系统。
- 长期记忆。

MVP 用本地 mock 数据和 mock 工具模拟真实能力。工具接口要设计得像真实生产工具，后续可替换为真实服务。

## 3. 技术栈

- 语言：TypeScript。
- Monorepo：pnpm workspace + Turborepo。
- 前端：Next.js App Router。
- 后端：Next.js Route Handlers 作为 MVP BFF 层。第一版不拆独立 Fastify 服务，避免服务编排成本。
- 共享类型：Zod schema + TypeScript 类型。
- Agent Runtime：LangGraph.js `StateGraph`，显式表达规划、工具调用、校验、修复、执行和人工确认节点。
- Agent 工具层：LangChain JS `tool()` + 自定义工具 registry。
- Mock 数据：JSON 文件或内存仓库。
- 状态存储：MVP 用内存 session store；后续可接 LangGraph checkpoint 或 SQLite。
- LLM：通过 LangChain chat model 封装。第一版支持 OpenAI-compatible chat completion，也保留 deterministic fallback。

### 关键依赖

```text
@langchain/langgraph    # 状态图、条件分支、agent orchestration
langchain               # tool(), agent 相关高层封装
@langchain/core         # messages、runnables、tool schema 基础能力
@langchain/openai       # OpenAI-compatible chat model
zod                     # 工具入参和共享数据模型校验
```

### 架构决策

- Agent 核心必须放在 `packages/agent`，不能写进 API route。API route 只负责鉴权占位、参数校验、调用 agent、返回结果。
- 规划和执行用 LangGraph 显式建图，不直接用一个黑盒 `createAgent()` 完成全流程。这样可以清楚展示状态、分支、repair 和 human-in-the-loop。
- 工具必须通过 `packages/tools` 的 registry 调用，再包装为 LangChain `tool()`。planner 不能直接 import 某个 mock 函数。
- LLM 只产出结构化候选、工具调用意图和自然语言解释，最终状态变化由 LangGraph 节点和条件边控制。
- Mock 数据可以是假数据，但执行结果不能由 LLM 编造，必须由工具 handler 返回。
- `/api/plan` 只运行到 `READY_FOR_CONFIRMATION`，不会执行下单动作。`/api/execute` 只执行用户确认过的 plan actions。

## 4. Monorepo 结构

```text
meituan-hackthon/
  apps/
    web/
      app/
        page.tsx
        api/
          plan/route.ts
          execute/route.ts
          sessions/[sessionId]/route.ts
      components/
        ChatPanel.tsx
        PlanTimeline.tsx
        ToolTracePanel.tsx
        ExecutionPanel.tsx
      lib/
        apiClient.ts
  packages/
    agent/
      src/
        index.ts
        graph.ts
        state.ts
        edges.ts
        prompts.ts
        policies.ts
        nodes/
          parseGoal.ts
          generateCandidates.ts
          callTools.ts
          composePlan.ts
          verifyPlan.ts
          repairPlan.ts
          waitForConfirmation.ts
          executeActions.ts
        adapters/
          toApiResponse.ts
          toToolTrace.ts
    tools/
      src/
        index.ts
        registry.ts
        schemas.ts
        langchainTools.ts
        mock/
          activityTools.ts
          restaurantTools.ts
          reservationTools.ts
          deliveryTools.ts
          messagingTools.ts
    data/
      src/
        activities.ts
        restaurants.ts
        products.ts
        userProfiles.ts
    shared/
      src/
        schemas.ts
        types.ts
        errors.ts
    llm/
      src/
        index.ts
        createChatModel.ts
        OpenAICompatModel.ts
        FakeLLMClient.ts
  package.json
  pnpm-workspace.yaml
  turbo.json
```

### 包职责

`apps/web`

- 负责 UI、API route 和 session 展示。
- 不直接写业务规划逻辑。
- 调用 `@mh/agent` 暴露的 `runPlanning()` 和 `executePlan()`。

`packages/agent`

- Agent 核心。
- 用 LangGraph `StateGraph` 管理 agent loop、状态、节点、条件边、计划校验、异常恢复。
- 节点函数只处理一类任务，例如解析目标、召回候选、校验计划、修复计划、执行动作。
- 不依赖 React 或 Web UI。

`packages/tools`

- 统一工具注册中心。
- 每个工具都有 name、description、inputSchema、outputSchema、handler。
- `langchainTools.ts` 将 registry 中的工具包装为 LangChain `tool()`，供 LangGraph 节点调用。
- MVP handler 读取 `@mh/data` mock 数据。

`packages/data`

- 本地 mock 商家、活动、商品、用户资料数据。
- 数据要足够支撑家庭和朋友两个剧本。

`packages/shared`

- 跨前后端共享类型、Zod schema、错误码。
- API 入参、Plan、ToolCall、ExecutionReceipt 都从这里导出。

`packages/llm`

- 封装 LangChain chat model 创建逻辑。
- Agent 节点只依赖 `BaseChatModel` 风格接口，不直接依赖具体模型供应商。

## 5. 核心数据模型

### UserGoal

```ts
type UserGoal = {
  rawText: string;
  scenario?: "family" | "friends" | "unknown";
  date: string;
  startWindow: "afternoon" | "evening" | "unknown";
  durationHours: {
    min: number;
    max: number;
  };
  origin: {
    label: string;
    lat: number;
    lng: number;
  };
  party: PartyMember[];
  preferences: string[];
  constraints: string[];
};
```

### Plan

```ts
type Plan = {
  id: string;
  title: string;
  scenario: "family" | "friends";
  summary: string;
  totalDurationMinutes: number;
  estimatedBudgetCny: number;
  confidence: number;
  timeline: PlanStep[];
  requiredActions: PlanAction[];
  alternatives: PlanAlternative[];
  risks: PlanRisk[];
};
```

### PlanStep

```ts
type PlanStep = {
  id: string;
  type: "travel" | "activity" | "meal" | "delivery" | "free_walk";
  title: string;
  placeName?: string;
  address?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string[];
  evidence: ToolCallRef[];
};
```

### PlanAction

```ts
type PlanAction = {
  id: string;
  type:
    | "reserve_restaurant"
    | "book_activity"
    | "schedule_delivery"
    | "send_message";
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  toolName: string;
  input: unknown;
  receipt?: ExecutionReceipt;
  fallbackActionId?: string;
};
```

### ToolCallTrace

```ts
type ToolCallTrace = {
  id: string;
  toolName: string;
  input: unknown;
  output?: unknown;
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  endedAt?: string;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
};
```

## 6. Agent Loop 设计

MVP 使用 LangGraph.js 实现一个真实但极简的 agent loop，不做一次性 prompt 出答案。LangGraph 负责“流程可控”，LangChain 负责“模型和工具抽象”。

### 为什么不用纯 `createAgent()`

`createAgent()` 适合快速验证 tool calling，但本项目需要展示更细的业务控制：

- 规划阶段和执行阶段必须分离。
- 用户确认前不能预约、购票、配送或发送消息。
- 工具失败后要进入可解释的 repair 分支。
- 前端要展示每个节点、每次工具调用和最终凭证。
- 家庭场景和朋友场景有不同评分策略。

因此 MVP 使用自定义 LangGraph `StateGraph`，必要时可以在某个节点内部使用 LangChain agent 或 model tool-calling。

### Graph 状态

```ts
type AgentGraphState = {
  sessionId: string;
  mode: "plan_only" | "execute_confirmed_plan";
  userMessage: string;
  now: string;
  goal?: UserGoal;
  candidates: Plan[];
  selectedPlan?: Plan;
  planValidation?: {
    isValid: boolean;
    blockingIssues: string[];
    confidence: number;
  };
  confirmedPlanId?: string;
  messages: AgentMessage[];
  toolTraces: ToolCallTrace[];
  repairCount: number;
  needsUserInput?: {
    question: string;
    options?: string[];
  };
  executionReceipts: ExecutionReceipt[];
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
};
```

### Graph 节点

```text
parseGoal
  从自然语言解析 UserGoal，不足时生成 needsUserInput。

generateCandidates
  基于场景策略生成 2-3 条候选路线骨架。

callTools
  调用活动、餐厅、排队、座位、配送等查询工具，写入 toolTraces。

composePlan
  将候选、工具结果和评分策略合成最优 Plan。

verifyPlan
  检查营业时间、座位、排队、儿童适配、减脂饮食、总时长和距离。

repairPlan
  当 verifyPlan 失败时换候选、改时间或降级动作。

waitForConfirmation
  停在 READY_FOR_CONFIRMATION，把计划返回前端等待用户确认。

executeActions
  只执行用户确认过的 PlanAction，生成 executionReceipts。
```

### Graph 流程

```text
START
-> parseGoal
-> needMoreInfo? WAITING_FOR_USER : generateCandidates
-> callTools
-> composePlan
-> verifyPlan
-> planValid? waitForConfirmation : repairPlan
-> repairPlan
-> verifyPlan
-> planValid 或 repairCount 达上限后 waitForConfirmation
-> END

execute_confirmed_plan:
START
-> executeActions
-> executionSucceeded? DONE : PARTIAL_FAILURE
-> END
```

### 条件边

```ts
function routeAfterParseGoal(state: AgentGraphState) {
  return state.needsUserInput ? "waitForUser" : "generateCandidates";
}

function routeAfterVerify(state: AgentGraphState) {
  if (
    state.planValidation?.isValid &&
    state.planValidation.confidence >= 0.75
  ) {
    return "waitForConfirmation";
  }

  if (state.repairCount >= 2) {
    return "waitForConfirmation";
  }

  return "repairPlan";
}

function routeAfterExecute(state: AgentGraphState) {
  const hasFailedRequiredAction = state.selectedPlan?.requiredActions.some(
    (action) => action.status === "failed" && !action.fallbackActionId,
  );

  return hasFailedRequiredAction ? "partialFailure" : "done";
}
```

### LangGraph 伪代码

```ts
import { END, START, StateGraph } from "@langchain/langgraph";
import { AgentGraphStateAnnotation } from "./state";
import { parseGoal } from "./nodes/parseGoal";
import { generateCandidates } from "./nodes/generateCandidates";
import { callTools } from "./nodes/callTools";
import { composePlan } from "./nodes/composePlan";
import { verifyPlan } from "./nodes/verifyPlan";
import { repairPlan } from "./nodes/repairPlan";
import { waitForConfirmation } from "./nodes/waitForConfirmation";
import { executeActions } from "./nodes/executeActions";

export function createPlanningGraph() {
  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("parseGoal", parseGoal)
    .addNode("generateCandidates", generateCandidates)
    .addNode("callTools", callTools)
    .addNode("composePlan", composePlan)
    .addNode("verifyPlan", verifyPlan)
    .addNode("repairPlan", repairPlan)
    .addNode("waitForConfirmation", waitForConfirmation)
    .addEdge(START, "parseGoal")
    .addConditionalEdges("parseGoal", routeAfterParseGoal, {
      waitForUser: END,
      generateCandidates: "generateCandidates",
    })
    .addEdge("generateCandidates", "callTools")
    .addEdge("callTools", "composePlan")
    .addEdge("composePlan", "verifyPlan")
    .addConditionalEdges("verifyPlan", routeAfterVerify, {
      waitForConfirmation: "waitForConfirmation",
      repairPlan: "repairPlan",
    })
    .addEdge("repairPlan", "verifyPlan")
    .addEdge("waitForConfirmation", END)
    .compile();
}

export function createExecutionGraph() {
  return new StateGraph(AgentGraphStateAnnotation)
    .addNode("executeActions", executeActions)
    .addEdge(START, "executeActions")
    .addConditionalEdges("executeActions", routeAfterExecute, {
      done: END,
      partialFailure: END,
    })
    .compile();
}
```

### API 输出

```ts
type AgentRunOutput = {
  sessionId: string;
  state:
    | "WAITING_FOR_USER"
    | "READY_FOR_CONFIRMATION"
    | "DONE"
    | "PARTIAL_FAILURE";
  messages: AgentMessage[];
  plan?: Plan;
  toolTraces: ToolCallTrace[];
  needsUserInput?: {
    question: string;
    options?: string[];
  };
  executionReceipts?: ExecutionReceipt[];
};
```

## 7. Planning 策略

### 步骤 1：目标解析

将自然语言转成结构化目标：

- 时间：今天下午、4-6 小时。
- 地点：离家近，默认 5 公里内。
- 人群：家庭或朋友。
- 偏好：儿童友好、健康饮食、社交、拍照、低排队。
- 约束：营业时间、预算、交通距离、儿童年龄、餐厅座位。

### 步骤 2：候选召回

调用工具：

- `searchNearbyActivities`
- `searchRestaurants`
- `searchAddOnProducts`

每类召回 5-10 个候选。

### 步骤 3：组合路线

用规则先生成 3 条候选路线：

- 稳妥路线：低排队、距离近、时间宽松。
- 体验路线：活动更有记忆点。
- 轻松路线：移动少、餐厅舒适。

### 步骤 4：可行性校验

调用：

- `checkActivityAvailability`
- `checkRestaurantAvailability`
- `checkQueueTime`
- `estimateTravelTime`

过滤不可执行路线。

### 步骤 5：评分排序

家庭场景：

```text
儿童适配 25%
距离和交通 20%
低排队 20%
健康餐饮 20%
时间顺滑 15%
```

朋友场景：

```text
社交体验 25%
餐厅氛围 20%
活动新鲜感 20%
距离和交通 15%
预算可控 10%
低排队 10%
```

## 8. 工具清单

### 工具封装方式

每个业务工具先在 registry 中定义，再统一包装成 LangChain tool。这样既能被 LangGraph 节点调用，也能在前端展示稳定的工具轨迹。

```ts
type AppTool<I, O> = {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  handler: (input: I, context: ToolContext) => Promise<O>;
};
```

LangChain 包装层：

```ts
import { tool } from "langchain";

export function toLangChainTool<I, O>(appTool: AppTool<I, O>) {
  return tool(
    async (input, runtime) => {
      const startedAt = new Date().toISOString();

      try {
        const parsedInput = appTool.inputSchema.parse(input);
        const output = await appTool.handler(parsedInput, {
          toolCallId: runtime.tool_call_id,
          startedAt,
        });

        return appTool.outputSchema.parse(output);
      } catch (error) {
        throw normalizeToolError(error);
      }
    },
    {
      name: appTool.name,
      description: appTool.description,
      schema: appTool.inputSchema,
    },
  );
}
```

`callTools` 节点负责把每次工具调用转成 `ToolCallTrace`。前端只消费 trace，不需要理解 LangChain 内部消息格式。

### 用户与位置

`getUserProfile`

- 输入：`userId`
- 输出：家庭成员、常用地址、预算偏好。

`estimateTravelTime`

- 输入：起点、终点、出发时间。
- 输出：预计分钟数。

### 活动

`searchNearbyActivities`

- 输入：位置、时间、人群标签、半径。
- 输出：活动候选列表。

`checkActivityAvailability`

- 输入：活动 ID、人数、时间。
- 输出：是否可预约、剩余名额、价格。

`bookActivity`

- 输入：活动 ID、人数、时间、联系人。
- 输出：预约凭证。

### 餐厅

`searchRestaurants`

- 输入：位置、人群、饮食偏好、时间、人数。
- 输出：餐厅候选列表。

`checkRestaurantAvailability`

- 输入：餐厅 ID、人数、时间。
- 输出：是否有位、可订时间段。

`checkQueueTime`

- 输入：餐厅 ID、到店时间。
- 输出：预计排队分钟数。

`reserveRestaurant`

- 输入：餐厅 ID、人数、时间、联系人。
- 输出：订座凭证。

### 配送与附加服务

`searchAddOnProducts`

- 输入：场景、配送地点、到达时间。
- 输出：蛋糕、鲜花、儿童小礼物等商品。

`scheduleDelivery`

- 输入：商品 ID、配送地址、送达时间、备注。
- 输出：配送单凭证。

### 通知

`sendMessage`

- 输入：收件人、消息内容。
- 输出：发送状态。

## 9. API 设计

### 创建规划

`POST /api/plan`

请求：

```json
{
  "sessionId": "optional-existing-session",
  "message": "今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。"
}
```

响应：

```json
{
  "sessionId": "sess_123",
  "state": "READY_FOR_CONFIRMATION",
  "plan": {},
  "toolTraces": [],
  "messages": []
}
```

### 执行已确认计划

`POST /api/execute`

请求：

```json
{
  "sessionId": "sess_123",
  "planId": "plan_123",
  "confirmedActionIds": [
    "reserve_restaurant",
    "book_activity",
    "schedule_delivery",
    "send_message"
  ]
}
```

响应：

```json
{
  "sessionId": "sess_123",
  "state": "DONE",
  "plan": {},
  "toolTraces": [],
  "receipts": []
}
```

### 查询 session

`GET /api/sessions/:sessionId`

返回当前对话、计划、工具轨迹和执行状态。

## 10. 前端 MVP

首页为实际工作台，不做 landing page。

### 布局

```text
┌──────────────────────────────────────────────────────┐
│ 顶部：场景标题 + 当前 session 状态                    │
├───────────────┬──────────────────────┬───────────────┤
│ ChatPanel     │ PlanTimeline          │ ToolTracePanel│
│ 自然语言输入  │ 下午时间线             │ 工具调用轨迹  │
│ Agent 回复    │ 候选/最终方案          │ 成功/失败状态 │
├───────────────┴──────────────────────┴───────────────┤
│ ExecutionPanel：确认按钮、执行进度、凭证、最终消息     │
└──────────────────────────────────────────────────────┘
```

### 核心交互

1. 用户输入一句话。
2. 页面调用 `/api/plan`。
3. 中间展示计划时间线。
4. 右侧展示工具调用过程。
5. 用户点击“确认并安排”。
6. 页面调用 `/api/execute`。
7. 展示订座、预约、配送、消息发送凭证。

### Demo 预置入口

提供两个快捷输入按钮：

- “家庭下午 4-6 小时”
- “4 个朋友下午出去玩”

## 11. 异常处理

### 工具失败

每个工具失败都返回标准错误：

```ts
type ToolError = {
  code:
    | "NO_AVAILABILITY"
    | "QUEUE_TOO_LONG"
    | "OUT_OF_BUSINESS_HOURS"
    | "DELIVERY_UNAVAILABLE"
    | "UNKNOWN";
  message: string;
  recoverable: boolean;
  suggestedFallback?: string;
};
```

### 恢复策略

- 餐厅没位：查找同类餐厅或调整到店时间。
- 排队过长：换成可订座餐厅。
- 活动无名额：换同区域、同人群标签活动。
- 配送不可达：改为到店自取或取消附加项。
- 消息发送失败：保留文案并提示用户手动发送。

### MVP 必演示异常

建议固定一个可控异常：首选餐厅 18:00 无 4 人桌，Agent 自动改订 18:30 或换备选餐厅。这样能展示“不是写死路线，而是在执行前校验和修复”。

## 12. LLM 使用边界

MVP 中 LLM 通过 LangChain chat model 调用，负责：

- 将自然语言目标解析成结构化 `UserGoal`。
- 根据工具结果生成自然语言解释。
- 在多个候选中给出用户友好的推荐理由。
- 生成要发给朋友/家人的消息。
- 在允许 tool calling 的节点中提出工具调用意图。

LLM 不直接负责：

- 判断工具是否成功。
- 伪造预约结果。
- 直接修改执行状态。
- 跳过可行性校验。
- 决定是否越过用户确认去执行下单动作。

这些由 LangGraph 状态图、条件边和工具结果控制。

### 推荐模型调用方式

```ts
import { ChatOpenAI } from "@langchain/openai";

export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    temperature: 0.2,
  });
}
```

本地没有模型配置时，`FakeLLMClient` 返回固定结构化结果，保证 Demo 可以离线跑通。

## 13. 最小实现切片

### Slice 1：静态规划闭环

- 搭 monorepo。
- 实现 shared schema。
- 写 mock 数据。
- 实现 `searchNearbyActivities` 和 `searchRestaurants`。
- `/api/plan` 能返回一条家庭路线。
- 前端能展示时间线。

### Slice 2：LangChain 工具层

- 实现工具注册中心。
- 将 registry 工具包装为 LangChain `tool()`。
- 实现 tool trace。
- 实现 `FakeLLMClient`，没有 API key 时仍能跑 Demo。
- 前端展示工具轨迹。

### Slice 3：LangGraph 规划 loop

- 实现 `AgentGraphStateAnnotation`。
- 实现 planning graph：`parseGoal -> generateCandidates -> callTools -> composePlan -> verifyPlan -> repairPlan -> waitForConfirmation`。
- 实现候选生成、工具调用、校验、repair。
- `/api/plan` 调用 planning graph，并停在 `READY_FOR_CONFIRMATION`。
- 前端展示工具轨迹。

### Slice 4：执行闭环

- 实现 `reserveRestaurant`、`bookActivity`、`scheduleDelivery`、`sendMessage`。
- 实现 execution graph：`executeActions -> DONE/PARTIAL_FAILURE`。
- `/api/execute` 只执行用户确认过的 plan actions。
- 展示执行凭证。

### Slice 5：朋友场景与异常演示

- 加朋友场景 mock 数据。
- 加朋友场景评分策略。
- 加餐厅无座位 fallback。
- 打磨最终展示文案。

## 14. 验收标准

输入家庭场景时，系统应能：

- 正确识别家庭、孩子 5 岁、老婆减肥、下午 4-6 小时、离家近。
- 输出至少一条完整时间线。
- 展示至少 4 次工具调用。
- 明确说明餐厅有无座位和是否需要排队。
- 用户确认后生成至少 3 个执行凭证。
- 生成一条可发送给家人或朋友的最终安排消息。

输入朋友场景时，系统应能：

- 正确识别 4 人、2 男 2 女、社交活动诉求。
- 输出活动 + 餐厅 + 饭后安排。
- 在首选餐厅不可用时自动切换备选。
- 执行后展示订座和消息发送结果。

## 15. 推荐首版 Demo 剧本

### 家庭剧本

输入：

```text
今天下午是空的，想和老婆孩子出去玩几个小时，别离家太远，帮我安排一下。
```

输出概要：

```text
14:00 出发
14:25 到达亲子手作馆，孩子可以做陶艺，室内不晒
16:20 步行到附近公园轻松转一圈
17:30 到青禾轻食 Bistro，已确认 3 人桌，低脂套餐可选
18:50 回家
```

执行动作：

```text
已预约亲子手作馆 14:30-16:00
已预订青禾轻食 Bistro 17:30 三人桌
已安排儿童小蛋糕 17:25 送到餐厅
已生成发给老婆的安排消息
```

### 朋友剧本

输入：

```text
今天下午我们 4 个朋友，2 男 2 女，想出去玩几个小时，吃饭也一起安排，别太远。
```

输出概要：

```text
14:00 出发
14:30 看城市影像展
16:30 citywalk 到附近小吃街
18:00 去氛围餐厅聚餐
20:00 甜品店收尾
```

异常演示：

```text
首选餐厅 18:00 无 4 人桌，Agent 自动查到 18:30 有位，并调整前置 citywalk 时间。
```

## 16. 后续可扩展方向

- 接真实地图距离和 POI。
- 接真实餐厅库存、排队和预约能力。
- 加群聊投票。
- 加用户常用偏好记忆。
- 加预算控制。
- 支持“给朋友 3 个版本，让大家选”。
- 支持自动生成美团订单草稿，而不是直接下单。

## 17. 参考资料

- LangGraph.js 官方文档：https://docs.langchain.com/oss/javascript/langgraph
- LangChain JS Agents 官方文档：https://docs.langchain.com/oss/javascript/langchain/agents
- LangChain JS Tools 官方文档：https://docs.langchain.com/oss/javascript/langchain/tools
