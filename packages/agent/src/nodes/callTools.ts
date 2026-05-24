import type { AgentGraphState } from "../state";
import { tracedToolCall } from "../helpers";

export async function callTools(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
  if (!state.goal) {
    return {};
  }

  let traces = state.toolTraces;

  const call = async (toolName: string, input: unknown) => {
    const result = await tracedToolCall(toolName, input, traces);
    traces = result.toolTraces;
    return result.output;
  };

  await call("getUserProfile", { userId: "xiaoming" });

  if (state.goal.scenario === "family") {
    await call("searchNearbyActivities", {
      scenario: "family",
      tags: ["child_friendly", "indoor"],
      radiusKm: 5
    });
    await call("checkActivityAvailability", {
      activityId: "kid-pottery",
      partySize: 3,
      time: "14:30"
    });
    await call("searchRestaurants", {
      scenario: "family",
      partySize: 3,
      preferences: ["healthy", "light", "low_fat"],
      radiusKm: 5
    });
    await call("checkRestaurantAvailability", {
      restaurantId: "qinghe-bistro",
      partySize: 3,
      time: "17:30"
    });
    await call("checkQueueTime", {
      restaurantId: "qinghe-bistro",
      time: "17:30"
    });
    await call("searchAddOnProducts", {
      scenario: "family",
      arrivalTime: "17:25"
    });
  } else {
    await call("searchNearbyActivities", {
      scenario: "friends",
      tags: ["social", "photo"],
      radiusKm: 5
    });
    await call("checkActivityAvailability", {
      activityId: "city-photo-exhibit",
      partySize: 4,
      time: "14:30"
    });
    await call("searchRestaurants", {
      scenario: "friends",
      partySize: 4,
      preferences: ["atmosphere", "photo"],
      radiusKm: 5
    });
    await call("checkRestaurantAvailability", {
      restaurantId: "neon-table",
      partySize: 4,
      time: "18:00"
    });
    await call("checkRestaurantAvailability", {
      restaurantId: "neon-table",
      partySize: 4,
      time: "18:30"
    });
    await call("checkQueueTime", {
      restaurantId: "neon-table",
      time: "18:30"
    });
    await call("searchAddOnProducts", {
      scenario: "friends",
      arrivalTime: "18:20"
    });
  }

  return { toolTraces: traces };
}
