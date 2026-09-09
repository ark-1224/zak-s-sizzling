import "dotenv/config";
import cron from "node-cron";
import { backupDatabase } from "./jobs/backupDatabase";
import { lowStockSweep } from "./jobs/lowStockSweep";

console.log("[worker] Zak's Sizzling Hub background worker started");

// Nightly backup at 2:00 AM.
cron.schedule("0 2 * * *", () => {
  backupDatabase().catch((err) => console.error("[backup] failed:", err));
});

// Low-stock sweep every hour.
cron.schedule("0 * * * *", () => {
  lowStockSweep().catch((err) => console.error("[low-stock] failed:", err));
});

console.log("[worker] scheduled: nightly backup (2:00 AM), hourly low-stock sweep");
