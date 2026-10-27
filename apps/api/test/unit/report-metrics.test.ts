import { describe, expect, it } from "vitest";
import { averageOrderValue } from "../../src/modules/reports/metrics";

describe("averageOrderValue", () => {
  it("is revenue divided by the number of paid orders", () => {
    expect(averageOrderValue(600, 3)).toBe(200);
  });

  it("rounds to the centavo", () => {
    expect(averageOrderValue(100, 3)).toBe(33.33);
    expect(averageOrderValue(200, 3)).toBe(66.67);
  });

  it("is null when there were no orders, instead of dividing by zero", () => {
    expect(averageOrderValue(0, 0)).toBeNull();
  });
});
