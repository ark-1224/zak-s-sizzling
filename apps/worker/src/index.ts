import "dotenv/config";
import cron from "node-cron";
import { backupDatabase, DEPLOYED_BACKUP_DIR, LOCAL_BACKUP_DIR } from "./jobs/backupDatabase";
import { lowStockSweep } from "./jobs/lowStockSweep";
import { sendLowStockAlerts } from "./jobs/sendLowStockAlerts";
import { describeMailConfig, mailerFromConfig, readMailSettings } from "./lib/mailer";
import { createStorageClient, describeStorageConfig, describeStorageError, listBackups, readStorageSettings } from "./lib/storage";

console.log("[worker] Zak's Sizzling Hub background worker started");

// Checking `=== "development"` (not `!== "production"`) is deliberate: if NODE_ENV is
// ever left unset on a deployed service, it must not behave like local dev.
const isLocalDev = process.env.NODE_ENV === "development";

// Nightly database backup at 2:00 AM Philippine time (jobs/backupDatabase.ts). Locally
// it's always scheduled: written to apps/worker/backups, and uploaded as well when cloud
// storage is set up. Deployed, it's scheduled only with cloud storage, because the
// container's disk doesn't survive a redeploy; there the file is deleted once uploaded.
const storageConfig = readStorageSettings();
const storage = storageConfig.ok ? { client: createStorageClient(storageConfig.settings), bucket: storageConfig.settings.bucket } : null;
const backupsScheduled = isLocalDev || storage !== null;

// Stops a slow backup (pg_dump has its own 5-minute timeout) from overlapping the next one.
let backupRunning = false;
function runBackup(reason: string) {
  if (backupRunning) {
    console.warn(`[backup] previous backup still running; skipping the ${reason} one`);
    return;
  }
  backupRunning = true;
  backupDatabase({ storage, outDir: isLocalDev ? LOCAL_BACKUP_DIR : DEPLOYED_BACKUP_DIR, removeAfterUpload: !isLocalDev })
    .catch((err) => console.error(`[backup] ${reason} backup failed: ${err instanceof Error ? err.message : err}`))
    .finally(() => {
      backupRunning = false;
    });
}

if (backupsScheduled) cron.schedule("0 2 * * *", () => runBackup("nightly"), { timezone: "Asia/Manila" });

// Deployed with cloud storage: after a restart or some downtime, don't wait for 2:00 AM
// if the newest backup is more than a day old. Checking the bucket at every start also
// shows straight away whether the storage settings work.
if (!isLocalDev && storage) {
  setTimeout(async () => {
    try {
      const [newest] = await listBackups(storage.client, storage.bucket);
      if (newest && Date.now() - newest.lastModified.getTime() < 24 * 60 * 60 * 1000) {
        console.log(`[backup] newest cloud backup: ${newest.key} (${newest.lastModified.toISOString()}); next one at 2:00 AM`);
        return;
      }
      console.log(`[backup] ${newest ? "the newest cloud backup is over a day old" : "no cloud backup yet"}; taking one now`);
      runBackup("catch-up");
    } catch (err) {
      console.error(`[backup] could not check the bucket: ${describeStorageError(err)}`);
    }
  }, 30_000);
}

// Low-stock sweep every hour — runs everywhere, no external tooling required.
cron.schedule("0 * * * *", () => {
  lowStockSweep().catch((err) => console.error("[low-stock] failed:", err));
});

console.log(`[worker] ${describeStorageConfig(storageConfig)}`);
console.log(
  backupsScheduled
    ? "[worker] scheduled: nightly backup (2:00 AM Manila time), hourly low-stock sweep"
    : "[worker] scheduled: hourly low-stock sweep (nightly backup off until cloud storage is set up)"
);

// Low-stock alert emails, checked every minute: the database queues an alert when an
// item reaches its minimum, and this sends whatever is waiting. Only scheduled when
// email is set up; until then alerts wait in low_stock_alerts (the log line says why).
const mailConfig = readMailSettings();
console.log(`[worker] ${describeMailConfig(mailConfig)}`);
const mailer = mailerFromConfig(mailConfig);
if (mailer) {
  let alertsRunning = false;
  cron.schedule("* * * * *", () => {
    if (alertsRunning) return; // a slow mail server mustn't stack up runs
    alertsRunning = true;
    sendLowStockAlerts(mailer)
      .catch((err) => console.error("[low-stock] alert run failed:", err))
      .finally(() => {
        alertsRunning = false;
      });
  });
}
