// Ported as-is from kiosk.html's categoryBgColor() (Downloads/kiosk.html, lines 557-567).
const CATEGORY_GRADIENTS: Record<string, string> = {
  "Sizzling Plates": "linear-gradient(135deg,#4A2E1F,#7A3A1C)",
  "Rice & Noodles": "linear-gradient(135deg,#EFE0BE,#E0C68F)",
  "Soups & Stews": "linear-gradient(135deg,#E8CBAE,#D89A6C)",
  Sides: "linear-gradient(135deg,#E3E0C4,#C9C494)",
  Drinks: "linear-gradient(135deg,#CFE0DB,#9DC4BB)",
  Specials: "linear-gradient(135deg,#8C2E12,#D8592B)",
};

export function categoryBgColor(categoryName: string | undefined): string {
  if (!categoryName) return "#eee";
  return CATEGORY_GRADIENTS[categoryName] ?? "#eee";
}
