import type { RawMaterialCategory } from "@zaks/shared-types";

/** The raw-material categories, in the order the Raw materials page lists them. */
export const RAW_MATERIAL_CATEGORIES: { value: RawMaterialCategory; label: string }[] = [
  { value: "meat_seafood", label: "Meat & seafood" },
  { value: "produce", label: "Vegetables & fruit" },
  { value: "rice_noodles", label: "Rice & noodles" },
  { value: "sauces_seasonings", label: "Sauces & seasonings" },
  { value: "oils_fats", label: "Oils & fats" },
  { value: "dairy_eggs", label: "Dairy & eggs" },
  { value: "drinks_ice", label: "Drinks & ice" },
  { value: "others", label: "Others" },
];

export const RAW_MATERIAL_CATEGORY_LABEL = Object.fromEntries(RAW_MATERIAL_CATEGORIES.map((c) => [c.value, c.label])) as Record<
  RawMaterialCategory,
  string
>;
