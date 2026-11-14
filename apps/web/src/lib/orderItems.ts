import type { OrderItemDTO } from "@zaks/shared-types";

/**
 * A line of an order as staff read it: "2× Beef Tapa", with any dishes cancelled after
 * payment ("2× Beef Tapa (1 cancelled)", or "Beef Tapa (cancelled)" when none are left).
 */
export function itemText(item: Pick<OrderItemDTO, "qty" | "cancelledQty" | "productName">): string {
  if (item.qty === 0) return `${item.productName} (cancelled)`;
  return `${item.qty}× ${item.productName}${item.cancelledQty > 0 ? ` (${item.cancelledQty} cancelled)` : ""}`;
}
