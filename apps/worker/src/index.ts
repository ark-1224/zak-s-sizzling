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
//
// Checking `=== "development"` (not `!== "production"`) is deliberate: if NODE_ENV
// is ever left unset on a deployed service, this must default to NOT scheduling the
// job, not scheduling it — an unset env var should never silently behave like local
// dev.
const isLocalDev = process.env.NODE_ENV === "development";

// Guards against a stalled pg_dump (network blip, lock wait) leaving a backup "running"
// forever and the next night's trigger piling a second execFile on top of it — pg_dump
// itself also gets a hard timeout now (see backupDatabase.ts), but this stops a cron
// tick from starting an overlapping run even during that timeout window.
let backupRunning = false;

if (isLocalDev) {
  cron.schedule("0 2 * * *", () => {
    if (backupRunning) {
      console.warn("[backup] previous run still in progress — skipping this trigger");
      return;
    }
    backupRunning = true;
    backupDatabase()
      .catch((err) => console.error("[backup] failed:", err))
      .finally(() => {
        backupRunning = false;
      });
  });
}

// Low-stock sweep every hour — runs everywhere, no external tooling required.
cron.schedule("0 * * * *", () => {
  lowStockSweep().catch((err) => console.error("[low-stock] failed:", err));
});

console.log(
  isLocalDev
    ? "[worker] scheduled: nightly backup (2:00 AM), hourly low-stock sweep"
    : "[worker] scheduled: hourly low-stock sweep (nightly backup skipped outside local dev — see Railway's managed Postgres backups)"
);
