import { activities } from "@mh/data";
import { type ExecutionReceipt, ExecutionReceiptSchema } from "@mh/shared";
import { z } from "zod";
import { ToolExecutionError } from "../errors";
import { createAppTool } from "../registry";
import { stableId } from "./helpers";

export const checkActivityAvailability = createAppTool({
  name: "checkActivityAvailability",
  description: "Check whether an activity has enough capacity at a time.",
  inputSchema: z.object({
    activityId: z.string(),
    partySize: z.number(),
    time: z.string()
  }),
  outputSchema: z.object({
    activityId: z.string(),
    available: z.boolean(),
    remaining: z.number(),
    priceCny: z.number()
  }),
  handler: ({ activityId, partySize, time }) => {
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) {
      throw new ToolExecutionError({
        code: "UNKNOWN",
        message: `Activity not found: ${activityId}`,
        recoverable: false
      });
    }

    const remaining = activity.capacity[time] ?? 0;
    if (remaining < partySize) {
      throw new ToolExecutionError({
        code: "NO_AVAILABILITY",
        message: `${activity.name} ${time} 剩余名额不足`,
        recoverable: true,
        suggestedFallback: "Try another time or similar nearby activity"
      });
    }

    return {
      activityId,
      available: true,
      remaining,
      priceCny: activity.priceCny * partySize
    };
  }
});

export const bookActivity = createAppTool({
  name: "bookActivity",
  description: "Create a mock activity booking receipt.",
  inputSchema: z.object({
    activityId: z.string(),
    partySize: z.number(),
    time: z.string(),
    contactName: z.string()
  }),
  outputSchema: ExecutionReceiptSchema,
  handler: ({ activityId, partySize, time }) => {
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) {
      throw new ToolExecutionError({
        code: "UNKNOWN",
        message: `Activity not found: ${activityId}`,
        recoverable: false
      });
    }

    return {
      id: stableId("ACT", [activityId, time, partySize]),
      type: "activity_booking",
      targetName: activity.name,
      time,
      status: "confirmed",
      details: {
        partySize,
        address: activity.address
      }
    } satisfies ExecutionReceipt;
  }
});
