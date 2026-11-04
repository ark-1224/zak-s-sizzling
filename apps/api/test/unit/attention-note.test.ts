import { describe, expect, it } from "vitest";
import { addAttentionNote } from "../../src/modules/payments/attentionNote";

describe("addAttentionNote", () => {
  it("starts the note when there is none", () => {
    expect(addAttentionNote(null, false, "Refund ₱100.")).toBe("Refund ₱100.");
  });

  it("adds to an unresolved note, so both amounts stay on screen", () => {
    expect(addAttentionNote("Refund ₱100.", true, "Refund ₱55.")).toBe("Refund ₱100.\nRefund ₱55.");
  });

  it("marks a note already sorted out before adding the new item", () => {
    expect(addAttentionNote("Refund ₱100.", false, "Refund ₱55.")).toBe("Refund ₱100. (Sorted out.)\nRefund ₱55.");
  });

  it("stays within the column, and says where to look when it is cut", () => {
    const note = addAttentionNote("x".repeat(990), true, "Refund ₱55.");

    expect(note).toHaveLength(1000);
    expect(note.endsWith("… More in PayMongo's dashboard.")).toBe(true);
  });
});
