// Price filter on the kiosk menu (Figure 2.2, "price filtering"). Fixed ranges that split
// the menu into its everyday groups: rice, sides and drinks under ₱100; most plates
// ₱100–₱199; specials and large plates ₱200 and up. A range includes its lower bound
// and stops below its upper one, so every price falls in exactly one range.
export type PriceRangeId = "any" | "under100" | "100to199" | "200up";

export interface PriceRange {
  id: PriceRangeId;
  label: string;
  min: number;
  max: number;
}

export const PRICE_RANGES: PriceRange[] = [
  { id: "any", label: "Any price", min: 0, max: Infinity },
  { id: "under100", label: "Under ₱100", min: 0, max: 100 },
  { id: "100to199", label: "₱100–₱199", min: 100, max: 200 },
  { id: "200up", label: "₱200 and up", min: 200, max: Infinity },
];

export function inPriceRange(price: number, id: PriceRangeId): boolean {
  const range = PRICE_RANGES.find((r) => r.id === id) ?? PRICE_RANGES[0];
  return price >= range.min && price < range.max;
}
