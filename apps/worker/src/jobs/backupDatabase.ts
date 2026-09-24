import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Runs `pg_dump` against DATABASE_URL and writes a timestamped plain-SQL backup.
 * Railway's own filesystem is ephemeral without a mounted Volume — in production this
 * job should upload the resulting file to object storage (Cloudflare R2/Backblaze B2)
 * afterward rather than trusting local disk to survive a redeploy. That upload step
 * isn't implemented here (no storage credentials configured in this environment) —
 * flagging it rather than pretending it's handled.
 */
// pg_dump's timeout: long enough for a real dump, short enough that a stalled
// connection doesn't hang the worker (and block the next scheduled run — see the
// concurrency guard in index.ts) forever.
const PG_DUMP_TIMEOUT_MS = 5 * 60 * 1000;

export async function backupDatabase(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const pgDumpPath = process.env.PG_DUMP_PATH || "pg_dump";

  const outDir = path.resolve(__dirname, "../../backups");
  await mkdir(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `zaks-backup-${timestamp}.sql`);

  // Pass the connection string straight through rather than hand-decomposing it into
  // -h/-p/-U/-d flags: libpq's own URI parser handles percent-decoding and query-string
  // params (sslmode, pooler flags, etc.) correctly, where the manual version didn't —
  // a password containing a literal "%" not part of a valid escape (e.g. "P@ss50%Off")
  // made decodeURIComponent throw, and any DATABASE_URL query params were silently
  // dropped since only hostname/port/username/pathname were ever read.
  await new Promise<void>((resolve, reject) => {
    execFile(
      pgDumpPath,
      [databaseUrl, "-F", "p", "-f", outFile],
      { timeout: PG_DUMP_TIMEOUT_MS },
      (error, _stdout, stderr) => {
        if (error) return reject(new Error(`pg_dump failed: ${stderr || error.message}`));
        resolve();
      }
    );
  });

  console.log(`[backup] wrote ${outFile}`);
  return outFile;
}

if (require.main === module) {
  backupDatabase()
    .then((file) => {
      console.log(`Backup complete: ${file}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
