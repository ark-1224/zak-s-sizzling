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
export async function backupDatabase(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const url = new URL(databaseUrl);
  const pgDumpPath = process.env.PG_DUMP_PATH || "pg_dump";

  const outDir = path.resolve(__dirname, "../../backups");
  await mkdir(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `zaks-backup-${timestamp}.sql`);

  await new Promise<void>((resolve, reject) => {
    execFile(
      pgDumpPath,
      [
        "-h", url.hostname,
        "-p", url.port || "5432",
        "-U", decodeURIComponent(url.username),
        "-d", url.pathname.slice(1),
        "-F", "p",
        "-f", outFile,
      ],
      { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } },
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
