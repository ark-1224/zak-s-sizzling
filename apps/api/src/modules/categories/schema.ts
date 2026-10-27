import { z } from "zod";

// The manuscript's category fields (data dictionary): name, icon, sort order, is new.
// The icon is an emoji, as on the kiosk's category rail; the column holds 8 characters.
const icon = z
  .string()
  .trim()
  .refine((value) => [...value].length <= 8, "Use one emoji as the icon")
  .nullable();

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name").max(80, "Keep the name to 80 characters or fewer"),
  icon: icon.optional(),
  isNew: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// The kiosk rail's order: every category id, first to last.
export const categoryOrderSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});
