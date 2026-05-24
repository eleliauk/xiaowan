import type { AgentEventDisplay, ToolCallTrace, ToolError } from "@mh/core/shared";

type Display = NonNullable<AgentEventDisplay>;

const toolTitles: Record<string, string> = {
  getUserProfile: "读取家庭画像",
  estimateTravelTime: "估算路程",
  searchNearbyActivities: "查询活动候选",
  searchRestaurants: "查询餐厅候选",
  searchAddOnProducts: "查询可选加购",
  checkActivityAvailability: "确认活动名额",
  checkRestaurantAvailability: "确认餐厅桌位",
  checkQueueTime: "确认排队时长",
  bookActivity: "预约活动",
  reserveRestaurant: "预订餐厅",
  scheduleDelivery: "安排配送",
  sendMessage: "发送通知"
};

function titleForTool(toolName: string) {
  return toolTitles[toolName] ?? toolName;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function displayText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(displayText).join(",");
  }

  if (value && typeof value === "object") {
    const record = asRecord(value);
    const label = text(record.label) ?? text(record.name) ?? text(record.title) ?? text(record.id);
    if (label) {
      return label;
    }

    const lat = text(record.lat);
    const lng = text(record.lng);
    return lat && lng ? `${lat},${lng}` : "对象";
  }

  return text(value) ?? "-";
}

function pickName(value: unknown) {
  const record = asRecord(value);
  return text(record.name) ?? text(record.title) ?? text(record.label) ?? text(record.id) ?? "候选";
}

function compactItems(values: unknown[], label: string) {
  return values.slice(0, 2).map((item) => {
    const record = asRecord(item);
    const suffixes = [text(record.type), record.priceCny ? `${record.priceCny} 元` : undefined].filter(Boolean);
    return {
      label,
      value: suffixes.length > 0 ? `${pickName(item)} · ${suffixes.join(" · ")}` : pickName(item)
    };
  });
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function toolStartedDisplay(toolName: string, input: unknown): Display {
  const record = asRecord(input);
  const items = Object.entries(record)
    .slice(0, 3)
    .map(([label, value]) => ({ label, value: displayText(value) }));

  return {
    title: titleForTool(toolName),
    summary: items.length > 0 ? items.map((item) => `${item.label}: ${item.value}`).join("，") : "准备调用工具。",
    items,
    severity: "info"
  };
}

function successDisplay(trace: ToolCallTrace): Display {
  const output = trace.output;

  if (trace.toolName === "getUserProfile") {
    const record = asRecord(output);
    const family = asArray(record.familyMembers);
    const friends = asArray(record.friendMembers);
    const home = asRecord(record.home);
    return {
      title: titleForTool(trace.toolName),
      summary: `家庭 ${family.length || 3} 人，朋友 ${friends.length || 4} 人，位置在${text(home.label) ?? "附近"}。`,
      items: [
        { label: "家庭", value: family.map(pickName).slice(0, 3).join("、") || "小明、老婆、孩子" },
        { label: "朋友", value: friends.map(pickName).slice(0, 4).join("、") || "4 位朋友" }
      ],
      severity: "success"
    };
  }

  if (trace.toolName === "searchNearbyActivities") {
    const activities = asArray(output);
    return {
      title: titleForTool(trace.toolName),
      summary: `找到 ${activities.length} 个活动候选。`,
      items: compactItems(activities, "活动"),
      severity: "success"
    };
  }

  if (trace.toolName === "searchRestaurants") {
    const restaurants = asArray(output);
    return {
      title: titleForTool(trace.toolName),
      summary: `找到 ${restaurants.length} 个餐厅候选。`,
      items: compactItems(restaurants, "餐厅"),
      severity: "success"
    };
  }

  if (trace.toolName === "estimateTravelTime") {
    const record = asRecord(output);
    return {
      title: titleForTool(trace.toolName),
      summary: `约 ${text(record.minutes) ?? "若干"} 分钟，${text(record.distanceKm) ?? "-"} km。`,
      items: [
        { label: "时间", value: `${text(record.minutes) ?? "-"} 分钟` },
        { label: "距离", value: `${text(record.distanceKm) ?? "-"} km` }
      ],
      severity: "success"
    };
  }

  if (trace.toolName === "checkActivityAvailability") {
    const record = asRecord(output);
    return {
      title: titleForTool(trace.toolName),
      summary: `有名额，剩余 ${text(record.remaining) ?? "-"} 个。`,
      items: [
        { label: "剩余", value: text(record.remaining) ?? "-" },
        { label: "费用", value: record.priceCny ? `${record.priceCny} 元` : "-" }
      ],
      severity: "success"
    };
  }

  if (trace.toolName === "checkRestaurantAvailability") {
    const record = asRecord(output);
    return {
      title: titleForTool(trace.toolName),
      summary: `${text(record.time) ?? "目标时段"} 可订 ${text(record.partySize) ?? "-"} 人桌。`,
      items: [
        { label: "时间", value: text(record.time) ?? "-" },
        { label: "人数", value: text(record.partySize) ?? "-" }
      ],
      severity: "success"
    };
  }

  if (trace.toolName === "checkQueueTime") {
    const record = asRecord(output);
    return {
      title: titleForTool(trace.toolName),
      summary: `预计排队 ${text(record.queueMinutes) ?? "-"} 分钟。`,
      items: [{ label: "排队", value: `${text(record.queueMinutes) ?? "-"} 分钟` }],
      severity: "success"
    };
  }

  const record = asRecord(output);
  if (text(record.id) || text(record.targetName)) {
    return {
      title: titleForTool(trace.toolName),
      summary: `${text(record.targetName) ?? "目标"}：${text(record.status) ?? "已完成"}`,
      items: [
        { label: "回执", value: text(record.id) ?? "-" },
        { label: "状态", value: text(record.status) ?? "-" }
      ],
      severity: "success",
      artifactRef: "receipts"
    };
  }

  return {
    title: titleForTool(trace.toolName),
    summary: "工具调用已完成。",
    severity: "success"
  };
}

function failureDisplay(toolName: string, error?: ToolError): Display {
  return {
    title: titleForTool(toolName),
    summary: error?.suggestedFallback
      ? `${error.message}；建议：${error.suggestedFallback}`
      : (error?.message ?? "工具调用失败。"),
    items: error
      ? [
          { label: "错误", value: error.code, status: error.recoverable ? "recoverable" : "blocking" },
          ...(error.suggestedFallback ? [{ label: "建议", value: error.suggestedFallback }] : [])
        ]
      : undefined,
    severity: error?.recoverable ? "warning" : "error",
    artifactRef: "diagnostics"
  };
}

export function toolFinishedDisplay(trace: ToolCallTrace): Display {
  if (trace.status === "skipped") {
    return {
      title: "跳过重复查询",
      summary: `已跳过重复的 ${titleForTool(trace.toolName)} 调用。`,
      items: [{ label: "工具", value: trace.toolName, status: "skipped" }],
      severity: "info",
      artifactRef: "diagnostics"
    };
  }

  return trace.status === "succeeded" ? successDisplay(trace) : failureDisplay(trace.toolName, trace.error);
}
