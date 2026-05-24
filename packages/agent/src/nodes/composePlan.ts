import type { Plan } from "@mh/shared";
import type { AgentGraphState } from "../state";

function familyPlan(): Plan {
  return {
    id: "plan-family-steady",
    title: "轻松亲子半日：手作 + 轻食 + 小惊喜",
    scenario: "family",
    summary: "下午先去室内亲子陶艺，避开暴晒和长排队；晚餐订清淡轻食，照顾孩子兴趣和减脂需求。",
    totalDurationMinutes: 290,
    estimatedBudgetCny: 599,
    confidence: 0.9,
    timeline: [
      {
        id: "family-travel-1",
        type: "travel",
        title: "从家出发",
        startTime: "14:00",
        endTime: "14:25",
        durationMinutes: 25,
        notes: ["车程短，给孩子留出缓冲时间"],
        evidence: []
      },
      {
        id: "family-activity",
        type: "activity",
        title: "亲子陶艺手作",
        placeName: "小手作陶艺亲子馆",
        address: "望京花园街 12 号",
        startTime: "14:30",
        endTime: "16:00",
        durationMinutes: 90,
        notes: ["室内活动", "适合 5 岁孩子", "已查到 14:30 有名额"],
        evidence: []
      },
      {
        id: "family-walk",
        type: "free_walk",
        title: "附近绿地散步",
        placeName: "麒麟社绿地散步线",
        address: "阜通西大街绿地",
        startTime: "16:20",
        endTime: "17:00",
        durationMinutes: 40,
        notes: ["活动后放松一下", "不额外消耗预算"],
        evidence: []
      },
      {
        id: "family-meal",
        type: "meal",
        title: "清淡晚餐",
        placeName: "青禾轻食 Bistro",
        address: "望京花园东路 18 号",
        startTime: "17:30",
        endTime: "18:30",
        durationMinutes: 60,
        notes: ["低脂套餐可选", "已确认 3 人桌", "预计无需排队"],
        evidence: []
      },
      {
        id: "family-delivery",
        type: "delivery",
        title: "儿童小蛋糕送到餐厅",
        placeName: "青禾轻食 Bistro",
        startTime: "17:25",
        endTime: "17:30",
        durationMinutes: 5,
        notes: ["作为孩子的小惊喜", "可取消，不影响主计划"],
        evidence: []
      }
    ],
    requiredActions: [
      {
        id: "family-book-activity",
        type: "book_activity",
        status: "pending",
        toolName: "bookActivity",
        optional: false,
        input: { activityId: "kid-pottery", partySize: 3, time: "14:30", contactName: "小明" }
      },
      {
        id: "family-reserve-meal",
        type: "reserve_restaurant",
        status: "pending",
        toolName: "reserveRestaurant",
        optional: false,
        input: { restaurantId: "qinghe-bistro", partySize: 3, time: "17:30", contactName: "小明" }
      },
      {
        id: "family-deliver-cake",
        type: "schedule_delivery",
        status: "pending",
        toolName: "scheduleDelivery",
        optional: true,
        input: { productId: "mini-kid-cake", targetName: "青禾轻食 Bistro", time: "17:25", note: "儿童小蛋糕，少糖" }
      },
      {
        id: "family-send-message",
        type: "send_message",
        status: "pending",
        toolName: "sendMessage",
        optional: false,
        input: {
          to: "老婆",
          content: "搞定了，下午 2 点出发，先去小手作陶艺亲子馆，17:30 去青禾轻食 Bistro，清淡一些也适合你。"
        }
      }
    ],
    alternatives: [],
    risks: []
  };
}

function friendsPlan(): Plan {
  return {
    id: "plan-friends-social",
    title: "展览 + Citywalk + 氛围晚餐",
    scenario: "friends",
    summary: "下午先看城市影像展，再走到小吃街轻松逛一段，晚餐选择适合四人聊天拍照的氛围餐厅。",
    totalDurationMinutes: 360,
    estimatedBudgetCny: 1128,
    confidence: 0.68,
    timeline: [
      {
        id: "friends-travel-1",
        type: "travel",
        title: "从集合点出发",
        startTime: "14:00",
        endTime: "14:30",
        durationMinutes: 30,
        notes: ["控制在近距离范围内"],
        evidence: []
      },
      {
        id: "friends-activity",
        type: "activity",
        title: "城市影像展",
        placeName: "城市影像展",
        address: "望京文化中心 3 层",
        startTime: "14:30",
        endTime: "16:10",
        durationMinutes: 100,
        notes: ["适合聊天拍照", "室内不累"],
        evidence: []
      },
      {
        id: "friends-walk",
        type: "free_walk",
        title: "小吃街 Citywalk",
        placeName: "望京小吃街 Citywalk",
        address: "阜通东大街小吃街",
        startTime: "16:30",
        endTime: "17:30",
        durationMinutes: 60,
        notes: ["饭前轻松逛", "时间可压缩给晚餐让路"],
        evidence: []
      },
      {
        id: "friends-meal",
        type: "meal",
        title: "氛围晚餐",
        placeName: "霓虹餐桌",
        address: "望京文化中心 1 层",
        startTime: "18:00",
        endTime: "19:30",
        durationMinutes: 90,
        notes: ["首选 18:00 四人桌待校验"],
        evidence: []
      }
    ],
    requiredActions: [
      {
        id: "friends-book-activity",
        type: "book_activity",
        status: "pending",
        toolName: "bookActivity",
        optional: false,
        input: { activityId: "city-photo-exhibit", partySize: 4, time: "14:30", contactName: "小明" }
      },
      {
        id: "friends-reserve-meal",
        type: "reserve_restaurant",
        status: "pending",
        toolName: "reserveRestaurant",
        optional: false,
        input: { restaurantId: "neon-table", partySize: 4, time: "18:00", contactName: "小明" }
      },
      {
        id: "friends-deliver-flowers",
        type: "schedule_delivery",
        status: "pending",
        toolName: "scheduleDelivery",
        optional: true,
        input: { productId: "table-flowers", targetName: "霓虹餐桌", time: "18:20", note: "放在四人桌上，方便拍照" }
      },
      {
        id: "friends-send-message",
        type: "send_message",
        status: "pending",
        toolName: "sendMessage",
        optional: false,
        input: {
          to: "小张",
          content: "搞定了，下午 2 点出发，先看城市影像展，再 citywalk，晚餐去霓虹餐桌。"
        }
      }
    ],
    alternatives: [
      { id: "friends-backup-meal", title: "巷口小面与茶", reason: "如果氛围餐厅无位，可换成小吃街附近轻聚餐" }
    ],
    risks: []
  };
}

export async function composePlan(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal || state.goal.scenario === "unknown") {
    return {};
  }

  return {
    selectedPlan: state.goal.scenario === "family" ? familyPlan() : friendsPlan()
  };
}
