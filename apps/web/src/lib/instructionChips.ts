// Starting special-instruction options for a NEW dish, by category, so a dessert or
// plain rice never starts with "Extra spicy" or "Well done" (UI review #23). Each dish
// now keeps its own options, edited in the admin's product form (panel feedback), and
// the kiosk shows those; these are only the defaults the form fills in. Existing dishes
// got the same sets from the product_instructions_and_bom migration. Category names are
// matched without regard to case; a category not listed here starts with none.

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
