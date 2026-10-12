// Quick special-instruction chips offered in the kiosk's product sheet, chosen by the
// dish's category so a dessert or plain rice never offers "Extra spicy" or "Well done"
// (UI review #23). Category names are matched without regard to case; a category not
// listed here (for example one an admin adds later) offers no chips, only the typed
// note, which is always available.
//
// Renaming a category in the admin changes which set applies, so keep the names below
// in step with the categories in apps/api/prisma/seed.ts.

const CHIPS_BY_CATEGORY: Record<string, string[]> = {
  "sizzling plates": ["Extra spicy", "Not spicy", "No onions", "Well done", "Sauce on the side"],
  "rice & noodles": ["Less oil", "No onions"],
  "soups & stews": ["Less salty", "No onions", "Extra hot"],
  sides: ["Sauce on the side", "Less oil"],
  drinks: ["Less ice", "No ice", "Less sugar"],
  specials: ["Extra crispy", "Sauce on the side", "No onions"],
  desserts: [],
};

export function instructionChipsFor(categoryName: string | undefined): string[] {
  return CHIPS_BY_CATEGORY[(categoryName ?? "").trim().toLowerCase()] ?? [];
}

/**
 * Chips that contradict each other: picking one turns the other off, so the kitchen
 * never gets "Extra spicy, Not spicy" (UI review #4).
 */
export const OPPOSITE_CHIP: Record<string, string> = {
  "Extra spicy": "Not spicy",
  "Not spicy": "Extra spicy",
  "Less ice": "No ice",
  "No ice": "Less ice",
};
