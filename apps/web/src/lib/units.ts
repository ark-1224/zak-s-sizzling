import type { MaterialUnit } from "@zaks/shared-types";

// Raw materials are stored in base units (g, ml, pc). Large amounts read better as kg
// or L on screen, so 2500 g shows as "2.5 kg". Nothing is converted in the database.
const LARGE: Partial<Record<MaterialUnit, { at: number; unit: string }>> = {
  g: { at: 1000, unit: "kg" },
  ml: { at: 1000, unit: "L" },
};

const trim = (n: number, digits: number) => n.toLocaleString("en-PH", { maximumFractionDigits: digits });

export function formatMaterialQty(qty: number, unit: MaterialUnit): string {
  const large = LARGE[unit];
  if (large && Math.abs(qty) >= large.at) return `${trim(qty / large.at, 2)} ${large.unit}`;
  return `${trim(qty, 3)} ${unit}`;
}

export const UNIT_LABELS: Record<MaterialUnit, string> = {
  g: "grams (g)",
  ml: "millilitres (ml)",
  pc: "pieces (pc)",
};
