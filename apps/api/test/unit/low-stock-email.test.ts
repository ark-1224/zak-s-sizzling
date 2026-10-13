import { describe, expect, it } from "vitest";
// The worker's low-stock email (sendLowStockAlerts.ts). Building the message needs no
// database; the job's Prisma client is created but never used here.
import { buildLowStockEmail, type AlertLine } from "../../../worker/src/jobs/sendLowStockAlerts";

// 10:42 PM in Manila.
const at = new Date("2026-10-15T14:42:00Z");
const juice: AlertLine = { itemName: "Calamansi Juice", kind: "product", stockQty: 3, minStockThreshold: 5, unit: null, createdAt: at };
const rice: AlertLine = { itemName: "Rice", kind: "raw material", stockQty: 2500, minStockThreshold: 5000, unit: "g", createdAt: at };

describe("the low-stock email", () => {
  it("names the item in the subject when there is one", () => {
    const email = buildLowStockEmail([juice]);

    expect(email.subject).toBe("Low stock: Calamansi Juice reached its minimum");
    expect(email.text).toContain("This item has reached its minimum stock level:");
    expect(email.text).toContain("- Calamansi Juice: 3 left, minimum 5 (Oct 15, 10:42 PM)");
  });

  it("counts the items when there are several, and shows large amounts in kg or L", () => {
    const email = buildLowStockEmail([juice, rice, { ...rice, itemName: "Cooking Oil", unit: "ml", stockQty: 750, minStockThreshold: 2000 }]);

    expect(email.subject).toBe("Low stock: 3 items reached their minimum");
    expect(email.text).toContain("- Rice (raw material): 2.5 kg left, minimum 5 kg (Oct 15, 10:42 PM)");
    expect(email.text).toContain("- Cooking Oil (raw material): 750 ml left, minimum 2 L (Oct 15, 10:42 PM)");
    expect(email.text).toContain("Amounts are from when each item reached its minimum.");
  });

  it("escapes item names in the HTML version", () => {
    const email = buildLowStockEmail([{ ...juice, itemName: `Tea <b>"Special"</b> & Co` }]);

    expect(email.html).toContain("Tea &#60;b&#62;&#34;Special&#34;&#60;/b&#62; &#38; Co");
    expect(email.html).not.toContain("<b>");
  });
});
