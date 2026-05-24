import { describe, expect, it } from "vitest";
import { toolStartedDisplay } from "../display";

describe("agent display metadata", () => {
  it("summarizes object-valued tool inputs with human labels", () => {
    const display = toolStartedDisplay("estimateTravelTime", {
      from: { label: "小明家", lat: 39.996, lng: 116.48 },
      to: { label: "小手作陶艺亲子馆", lat: 40.002, lng: 116.484 }
    });

    expect(display.summary).toContain("from: 小明家");
    expect(display.summary).toContain("to: 小手作陶艺亲子馆");
    expect(display.summary).not.toContain("[object Object]");
  });
});
