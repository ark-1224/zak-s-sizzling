import { redirect } from "next/navigation";

// The Inventory page was merged into Raw materials (panel feedback): every dish is made
// from a bill of materials, so a dish's stock is the servings its raw materials can make,
// shown on the Raw materials page's Dishes tab. Old links and bookmarks land there.
export default function AdminInventoryPage() {
  redirect("/admin/raw-materials?tab=dishes");
}
