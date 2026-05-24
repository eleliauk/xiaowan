import type { AgentArtifact, ExecutionReceipt, Plan, PlanAction, ToolCallTrace } from "@mh/core/shared";

type RenderContext = {
  updatedAt: string;
  toolTraces?: ToolCallTrace[];
};

function artifactId(plan: Plan) {
  return `artifact_${plan.id}`;
}

function clean(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "-";
}

function cell(value: string | number | undefined) {
  return clean(String(value ?? "-")).replaceAll("|", "\\|");
}

function actionLabel(action: PlanAction) {
  const labels: Record<PlanAction["type"], string> = {
    reserve_restaurant: "预订餐厅",
    book_activity: "预约活动",
    schedule_delivery: "安排配送",
    send_message: "发送消息"
  };
  return labels[action.type] ?? action.type;
}

function receiptLabel(receipt: ExecutionReceipt) {
  const labels: Record<ExecutionReceipt["type"], string> = {
    activity_booking: "活动预约",
    restaurant_reservation: "餐厅订位",
    delivery_order: "配送订单",
    message_send: "消息发送"
  };
  return labels[receipt.type] ?? receipt.type;
}

function suitability(plan: Plan) {
  const places = plan.timeline
    .map((step) => step.placeName ?? step.address)
    .filter(Boolean)
    .slice(0, 3);
  const points = [
    plan.scenario === "family" ? "围绕亲子同行安排，节奏相对轻松。" : "围绕朋友聚会安排，保留活动和用餐衔接。",
    places.length > 0 ? `核心地点集中在 ${places.join("、")}，减少来回折腾。` : "整体安排控制在本地短时活动范围内。",
    `预算预估 ${plan.estimatedBudgetCny} 元，置信度 ${Math.round(plan.confidence * 100)}%。`
  ];
  return points;
}

function pendingActions(plan: Plan) {
  if (plan.requiredActions.length === 0) {
    return "- 暂无需要确认后执行的动作。";
  }

  return plan.requiredActions
    .map((action) => `- ${actionLabel(action)}：${action.toolName}${action.optional ? "（可选）" : ""}`)
    .join("\n");
}

function riskSection(plan: Plan, toolTraces: ToolCallTrace[] = []) {
  const risks = plan.risks.map((risk) => `- ${risk.severity.toUpperCase()}：${risk.message}`);
  const diagnostics = toolTraces
    .filter((trace) => trace.status === "failed" || trace.status === "skipped")
    .slice(-5)
    .map((trace) => {
      const detail =
        trace.error?.message ?? (trace.status === "skipped" ? "已跳过重复或超限调用。" : "工具未返回可用结果。");
      return `- ${trace.toolName}：${detail}`;
    });

  return [...risks, ...diagnostics].join("\n") || "- 暂无阻塞风险。";
}

function receiptSection(receipts: ExecutionReceipt[]) {
  if (receipts.length === 0) {
    return "";
  }

  const rows = receipts
    .map(
      (receipt) =>
        `| ${cell(receiptLabel(receipt))} | ${cell(receipt.targetName)} | ${cell(receipt.status)} | ${cell(receipt.time)} | ${cell(receipt.id)} |`
    )
    .join("\n");

  return `\n\n## 执行回执\n\n| 类型 | 对象 | 状态 | 时间 | 回执 |\n| --- | --- | --- | --- | --- |\n${rows}`;
}

function renderMarkdown(plan: Plan, context: RenderContext, receipts: ExecutionReceipt[] = []) {
  const timelineRows = plan.timeline
    .map(
      (step) =>
        `| ${cell(`${step.startTime}-${step.endTime}`)} | ${cell(step.title)} | ${cell(step.placeName ?? step.address ?? step.type)} | ${cell(step.notes.join("；"))} |`
    )
    .join("\n");

  return [
    `# ${plan.title}`,
    "## 行程概览",
    plan.summary,
    "",
    `- 总时长：${Math.round(plan.totalDurationMinutes / 60)} 小时`,
    `- 预算：${plan.estimatedBudgetCny} 元`,
    `- 置信度：${Math.round(plan.confidence * 100)}%`,
    "",
    "## 时间线",
    "",
    "| 时间 | 事项 | 地点 | 说明 |",
    "| --- | --- | --- | --- |",
    timelineRows || "| - | - | - | - |",
    "",
    "## 为什么适合",
    "",
    suitability(plan)
      .map((point) => `- ${point}`)
      .join("\n"),
    "",
    "## 待确认动作",
    "",
    pendingActions(plan),
    "",
    "## 风险与备选",
    "",
    riskSection(plan, context.toolTraces),
    receiptSection(receipts)
  ].join("\n");
}

export function renderPlanMarkdownArtifact(plan: Plan, context: RenderContext): AgentArtifact {
  return {
    id: artifactId(plan),
    kind: "markdown",
    title: plan.title,
    content: renderMarkdown(plan, context),
    status: "draft",
    sourcePlanId: plan.id,
    updatedAt: context.updatedAt
  };
}

export function renderFinalMarkdownArtifact(
  plan: Plan,
  receipts: ExecutionReceipt[],
  context: RenderContext
): AgentArtifact {
  return {
    id: artifactId(plan),
    kind: "markdown",
    title: plan.title,
    content: renderMarkdown(plan, context, receipts),
    status: "final",
    sourcePlanId: plan.id,
    updatedAt: context.updatedAt
  };
}
