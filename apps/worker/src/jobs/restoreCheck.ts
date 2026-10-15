import "dotenv/config";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { describeCommandFailure, withoutPassword } from "../lib/pgCommand";
import { createStorageClient, describeStorageConfig, describeStorageError, downloadBackup, listBackups, readStorageSettings } from "../lib/storage";

/**
 * Proves a backup can be restored: `npm run backup:restore-check [backup]`.
 *
 * Takes the newest backup in cloud storage (or the key or local .sql.gz file given),
 * restores it with psql into RESTORE_DATABASE_URL, and prints how many rows the main
 * tables have, to compare with the live system. The target must be an empty database
 * whose name ends in "_restore_check", so this can never be pointed at the real
 * database by mistake. Set PSQL_PATH if psql isn't on the PATH.
 */

export const RESTORE_SUFFIX = "_restore_check";

/** Tables worth comparing after a restore, in a readable order. */
export const CHECKED_TABLES = [
  "users",
  "categories",
  "products",
  "inventory",
  "raw_materials",
  "recipe_items",
  "orders",
  "order_items",
  "payments",
  "kitchen_tasks",
  "stock_adjustments",
  "raw_material_movements",
  "low_stock_alerts",
  "_prisma_migrations",
];

/** The database name in a connection string, or null if it can't be read. */
export function databaseName(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || null;
  } catch {
    return null;
  }
}

function runPsql(psqlPath: string, connectionString: string, file: string): Promise<void> {
  // The password goes in PGPASSWORD, never on the command line (lib/pgCommand.ts).
  const { url, env } = withoutPassword(connectionString);
  return new Promise((resolve, reject) => {
    execFile(
      psqlPath,
      [url, "--quiet", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "--file", file],
      { timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024, env },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return reject(new Error(`psql wasn't found ("${psqlPath}"). Install the PostgreSQL 18 client, or set PSQL_PATH to psql's location.`));
        }
        reject(new Error(describeCommandFailure("psql", error, stderr)));
      }
    );
  });
}

export async function restoreCheck(source?: string): Promise<{ backup: string; counts: Record<string, number> }> {
  const url = process.env.RESTORE_DATABASE_URL;
  if (!url) throw new Error(`Set RESTORE_DATABASE_URL to an empty database whose name ends in "${RESTORE_SUFFIX}"`);
  const name = databaseName(url);
  if (!name?.endsWith(RESTORE_SUFFIX)) {
    throw new Error(`Refusing to restore into "${name ?? "(unreadable connection string)"}": the database name must end in "${RESTORE_SUFFIX}"`);
  }

  // The backup: a local file, or a key in cloud storage (the newest when none is given).
  let label: string;
  let gz: Buffer;
  if (source && existsSync(source)) {
    label = path.basename(source);
    gz = await readFile(source);
  } else {
    const config = readStorageSettings();
    if (!config.ok) throw new Error(describeStorageConfig(config));
    const client = createStorageClient(config.settings);
    try {
      const key = source ?? (await listBackups(client, config.settings.bucket))[0]?.key;
      if (!key) throw new Error(`No backups in bucket "${config.settings.bucket}" yet`);
      label = key;
      gz = await downloadBackup(client, config.settings.bucket, key);
    } catch (err) {
      throw new Error(describeStorageError(err));
    }
  }
  console.log(`[restore] restoring ${label} (${(gz.length / 1024).toFixed(1)} KB) into "${name}"`);

  const target = new PrismaClient({ datasources: { db: { url } } });
  const dir = await mkdtemp(path.join(os.tmpdir(), "zaks-restore-"));
  try {
    const [{ count }] = await target.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'`;
    if (count > 0) throw new Error(`"${name}" already has ${count} table(s). Restore into an empty database.`);

    const sqlFile = path.join(dir, "backup.sql");
    await writeFile(sqlFile, gunzipSync(gz));
    await runPsql(process.env.PSQL_PATH || "psql", url, sqlFile);

    const present = new Set(
      (await target.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).map((t) => t.tablename)
    );
    const counts: Record<string, number> = {};
    for (const table of CHECKED_TABLES.filter((t) => present.has(t))) {
      const [{ n }] = await target.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}"`);
      counts[table] = n;
    }
    return { backup: label, counts };
  } finally {
    await target.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  restoreCheck(process.argv[2])
    .then(({ backup, counts }) => {
      console.log(`[restore] ${backup} restored. Rows per table:`);
      for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(24)} ${n}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[restore] ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}
