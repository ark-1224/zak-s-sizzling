import type { StockItemKind } from "@zaks/shared-types";

// Small helpers shared by the market-purchase screens.

/** Today in Manila (YYYY-MM-DD), the default date of a purchase or report. */
export function manilaToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** "Nov 15" from YYYY-MM-DD. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A quantity without needless decimals ("2", "1.5", "0.25"). */
export const qty = (n: number) => String(Math.round(n * 1000) / 1000);

export const itemKey = (kind: StockItemKind, itemId: string) => `${kind}:${itemId}`;
