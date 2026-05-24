import { restaurants } from "@mh/data";
import { ExecutionReceiptSchema, type ExecutionReceipt } from "@mh/shared";
import { z } from "zod";
import { ToolExecutionError } from "../errors";
import { createAppTool } from "../registry";
import { stableId } from "./helpers";

function getRestaurant(id: string) {
  const restaurant = restaurants.find((item) => item.id === id);
  if (!restaurant) {
    throw new ToolExecutionError({
      code: "UNKNOWN",
      message: `Restaurant not found: ${id}`,
      recoverable: false
    });
  }
  return restaurant;
}

export const checkRestaurantAvailability = createAppTool({
  name: "checkRestaurantAvailability",
  description: "Check restaurant table availability for party size and time.",
  inputSchema: z.object({
    restaurantId: z.string(),
    partySize: z.number(),
    time: z.string()
  }),
  outputSchema: z.object({
    restaurantId: z.string(),
    available: z.boolean(),
    time: z.string(),
    partySize: z.number()
  }),
  handler: ({ restaurantId, partySize, time }) => {
    const restaurant = getRestaurant(restaurantId);
    const sizes = restaurant.availability[time] ?? [];
    if (!sizes.includes(partySize)) {
      throw new ToolExecutionError({
        code: "NO_AVAILABILITY",
        message: `${restaurant.name} ${time} 没有 ${partySize} 人桌`,
        recoverable: true,
        suggestedFallback: "Try 18:30 or a backup restaurant"
      });
    }

    return {
      restaurantId,
      available: true,
      time,
      partySize
    };
  }
});

export const checkQueueTime = createAppTool({
  name: "checkQueueTime",
  description: "Check restaurant queue time at the expected arrival time.",
  inputSchema: z.object({
    restaurantId: z.string(),
    time: z.string()
  }),
  outputSchema: z.object({
    restaurantId: z.string(),
    time: z.string(),
    queueMinutes: z.number()
  }),
  handler: ({ restaurantId, time }) => {
    const restaurant = getRestaurant(restaurantId);
    const queueMinutes = restaurant.queueMinutes[time] ?? 30;
    if (queueMinutes > 25) {
      throw new ToolExecutionError({
        code: "QUEUE_TOO_LONG",
        message: `${restaurant.name} ${time} 预计排队 ${queueMinutes} 分钟`,
        recoverable: true,
        suggestedFallback: "Choose a reservable restaurant or later time"
      });
    }

    return {
      restaurantId,
      time,
      queueMinutes
    };
  }
});

export const reserveRestaurant = createAppTool({
  name: "reserveRestaurant",
  description: "Create a mock restaurant reservation receipt.",
  inputSchema: z.object({
    restaurantId: z.string(),
    partySize: z.number(),
    time: z.string(),
    contactName: z.string()
  }),
  outputSchema: ExecutionReceiptSchema,
  handler: ({ restaurantId, partySize, time }) => {
    const restaurant = getRestaurant(restaurantId);
    return {
      id: stableId("RSV", [restaurantId, time, partySize]),
      type: "restaurant_reservation",
      targetName: restaurant.name,
      time,
      status: "confirmed",
      details: {
        partySize,
        address: restaurant.address
      }
    } satisfies ExecutionReceipt;
  }
});
