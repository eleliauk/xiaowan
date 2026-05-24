import { products } from "@mh/core/data";
import { type ExecutionReceipt, ExecutionReceiptSchema } from "@mh/core/shared";
import { z } from "zod";
import { ToolExecutionError } from "../errors";
import { createAppTool } from "../registry";
import { stableId } from "./helpers";

export const scheduleDelivery = createAppTool({
  name: "scheduleDelivery",
  description: "Schedule mock delivery to a restaurant or activity venue.",
  inputSchema: z.object({
    productId: z.string(),
    targetName: z.string(),
    time: z.string(),
    note: z.string().optional()
  }),
  outputSchema: ExecutionReceiptSchema,
  handler: ({ productId, targetName, time, note }) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      throw new ToolExecutionError({
        code: "UNKNOWN",
        message: `Product not found: ${productId}`,
        recoverable: false
      });
    }

    if (!product.deliveryWindows.includes(time)) {
      throw new ToolExecutionError({
        code: "DELIVERY_UNAVAILABLE",
        message: `${product.name} 无法在 ${time} 送达`,
        recoverable: true,
        suggestedFallback: "Skip the add-on or choose another delivery window"
      });
    }

    return {
      id: stableId("DLV", [productId, time]),
      type: "delivery_order",
      targetName,
      time,
      status: "scheduled",
      details: {
        productName: product.name,
        note
      }
    } satisfies ExecutionReceipt;
  }
});
