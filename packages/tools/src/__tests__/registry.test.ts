import { ExecutionReceiptSchema } from "@mh/shared";
import { describe, expect, it } from "vitest";
import { createDefaultToolRegistry, isToolExecutionError } from "../index";

describe("tool registry", () => {
  it("normalizes no availability errors from restaurant availability checks", async () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get("checkRestaurantAvailability");

    await expect(
      tool.invoke({
        restaurantId: "neon-table",
        partySize: 4,
        time: "18:00"
      })
    ).rejects.toMatchObject({
      code: "NO_AVAILABILITY",
      recoverable: true
    });
  });

  it("returns execution receipts from reservation tools", async () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get("reserveRestaurant");

    const receipt = ExecutionReceiptSchema.parse(
      await tool.invoke({
        restaurantId: "qinghe-bistro",
        partySize: 3,
        time: "17:30",
        contactName: "小明"
      })
    );

    expect(receipt).toMatchObject({
      type: "restaurant_reservation",
      targetName: "青禾轻食 Bistro",
      status: "confirmed"
    });
    expect(String(receipt.id)).toContain("RSV");
  });

  it("identifies normalized tool execution errors", async () => {
    const registry = createDefaultToolRegistry();
    const tool = registry.get("checkRestaurantAvailability");

    try {
      await tool.invoke({
        restaurantId: "neon-table",
        partySize: 4,
        time: "18:00"
      });
    } catch (error) {
      expect(isToolExecutionError(error)).toBe(true);
    }
  });
});
