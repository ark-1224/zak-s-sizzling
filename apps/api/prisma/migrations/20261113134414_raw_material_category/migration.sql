-- CreateEnum
CREATE TYPE "raw_material_category" AS ENUM ('meat_seafood', 'produce', 'rice_noodles', 'sauces_seasonings', 'oils_fats', 'dairy_eggs', 'drinks_ice', 'others');

-- AlterTable
ALTER TABLE "raw_materials" ADD COLUMN     "category" "raw_material_category" NOT NULL DEFAULT 'others';

-- Sort the raw materials already there by their names. The first match wins, so the
-- specific names come first ("Peanut butter" is a sauce, not a fat; "Patis (fish sauce)"
-- a sauce, not seafood; "Eggplant" a vegetable, not an egg). Anything not matched stays
-- in Others; the category can be changed on the Raw materials page.
UPDATE "raw_materials" SET "category" = (CASE
  WHEN lower("name") ~ '(peanut butter|mayonnaise)' THEN 'sauces_seasonings'
  WHEN lower("name") ~ '(\moil\M|margarine|butter|lard)' THEN 'oils_fats'
  WHEN lower("name") ~ '(^ice\M|\mtea\M|coke|soda|juice|\mwater\M|coffee|buko|softdrink|soft drink)' THEN 'drinks_ice'
  WHEN lower("name") ~ '(sauce|patis|vinegar|ketchup|\msalt\M|black pepper|peppercorn|sugar|bagoong|sinigang mix|annatto|achuete|bay leaf|laurel|sesame seed|seasoning|\mmsg\M|powder|worcestershire)' THEN 'sauces_seasonings'
  WHEN lower("name") ~ '(eggplant)' THEN 'produce'
  WHEN lower("name") ~ '(^egg|\megg\M|milk|cheese|cream)' THEN 'dairy_eggs'
  WHEN lower("name") ~ '(pork|beef|chicken|bangus|squid|oxtail|hungarian|hotdog|sausage|liver|\mfish\M|shrimp|tapa|liempo|maskara|kasim|ribs|tilapia|tuna|bacon|ham\M)' THEN 'meat_seafood'
  WHEN lower("name") ~ '(onion|garlic|ginger|tomato|cabbage|carrot|celery|kangkong|okra|pechay|sitaw|labanos|radish|papaya|puso ng saging|corn\M|sweet corn|calamansi|chili|pepper|lemongrass|tanglad|potato|lettuce|cucumber|mango|banana|pineapple|kalamansi)' THEN 'produce'
  WHEN lower("name") ~ '(rice|noodle|canton|bihon|flour|breadcrumb|cornstarch|wrapper|glutinous|pasta|bread)' THEN 'rice_noodles'
  ELSE 'others'
END)::"raw_material_category";
