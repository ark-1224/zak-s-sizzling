import "dotenv/config";
import cron from "node-cron";
import { backupDatabase } from "./jobs/backupDatabase";
import { lowStockSweep } from "./jobs/lowStockSweep";

console.log("[worker] Zak's Sizzling Hub background worker started");

// Nightly backup at 2:00 AM — local/dev only. `pg_dump` isn't available in Railway's
// default Node.js container, and Railway's managed Postgres already backs itself up
// at the platform level, so re-running this as a scheduled production job would just
// fail silently every night. backupDatabase.ts and `npm run backup:now` still work
// for local dev and for demoing the feature — this only skips the *schedule* in
// production. Enable Railway's Postgres backups from its dashboard (Postgres service
// → Backups) as the actual production safety net.
if (process.env.NODE_ENV !== "production") {
  cron.schedule("0 2 * * *", () => {
    backupDatabase().catch((err) => console.error("[backup] failed:", err));
  });
}

// Low-stock sweep every hour — runs everywhere, no external tooling required.
cron.schedule("0 * * * *", () => {
  lowStockSweep().catch((err) => console.error("[low-stock] failed:", err));
});

console.log(
  process.env.NODE_ENV !== "production"
    ? "[worker] scheduled: nightly backup (2:00 AM), hourly low-stock sweep"
    : "[worker] scheduled: hourly low-stock sweep (nightly backup skipped in production — see Railway's managed Postgres backups)"
);
