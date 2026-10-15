import { describe, expect, it } from "vitest";
import { EXTRA_SERVING_MINUTES, ORDER_AHEAD_MINUTES, estimatePrepMinutes } from "../../src/modules/orders/prepTime";

// The estimated preparation time formula (orders/prepTime.ts):
// longest dish + 1 min per extra serving + 2 min per order already in the kitchen.

describe("estimatePrepMinutes", () => {
  it("is the dish's own prep time for one serving and an empty kitchen", () => {
    expect(estimatePrepMinutes([{ prepMinutes: 12, qty: 1 }], 0)).toBe(12);
  });

  it("is set by the longest dish when several are cooked side by side", () => {
    const lines = [
      { prepMinutes: 5, qty: 1 },
      { prepMinutes: 15, qty: 1 },
      { prepMinutes: 10, qty: 1 },
    ];
    expect(estimatePrepMinutes(lines, 0)).toBe(15 + 2 * EXTRA_SERVING_MINUTES);
  });

  it("adds a minute for every serving after the first, of any dish", () => {
    expect(estimatePrepMinutes([{ prepMinutes: 12, qty: 4 }], 0)).toBe(12 + 3);
    expect(
      estimatePrepMinutes(
        [
          { prepMinutes: 12, qty: 2 },
          { prepMinutes: 5, qty: 3 },
        ],
        0
      )
    ).toBe(12 + 4);
  });

  it("adds two minutes for each order already in the kitchen", () => {
    expect(estimatePrepMinutes([{ prepMinutes: 12, qty: 1 }], 3)).toBe(12 + 3 * ORDER_AHEAD_MINUTES);
  });

  it("grows with order size: one, five and twenty servings of the same dish", () => {
    const sizes = [1, 5, 20].map((qty) => estimatePrepMinutes([{ prepMinutes: 10, qty }], 0));
    expect(sizes).toEqual([10, 14, 29]);
  });

  it("leaves out items served as they are (0 minutes), so they add no serving time", () => {
    const lines = [
      { prepMinutes: 12, qty: 1 },
      { prepMinutes: 0, qty: 5 },
    ];
    expect(estimatePrepMinutes(lines, 0)).toBe(12);
  });

  it("is 0 for an order of only ready-to-serve items, however busy the kitchen is", () => {
    expect(estimatePrepMinutes([{ prepMinutes: 0, qty: 3 }], 4)).toBe(0);
  });

  it("is 0 for no lines, and treats a negative queue as an empty one", () => {
    expect(estimatePrepMinutes([], 2)).toBe(0);
    expect(estimatePrepMinutes([{ prepMinutes: 8, qty: 1 }], -1)).toBe(8);
  });
});
