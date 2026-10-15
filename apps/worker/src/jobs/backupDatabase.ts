import "dotenv/config";
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import type { S3Client } from "@aws-sdk/client-s3";
import { createStorageClient, describeStorageConfig, describeStorageError, readStorageSettings, uploadBackup, type StoredBackup } from "../lib/storage";

/**
 * Backs up the whole database with `pg_dump` (plain SQL, gzip-compressed) and, when
 * cloud storage is set up, uploads it there (lib/storage.ts). The dump leaves out
 * owners and privileges (--no-owner --no-acl), so it restores into any database:
 * `gunzip -c file.sql.gz | psql <empty database>`, or `npm run backup:restore-check`.
 *
 * pg_dump has to be at least the server's version (PostgreSQL 18 on Railway). The
 * deployed worker is built from apps/worker/Dockerfile, which installs the PostgreSQL 18
 * client; locally, set PG_DUMP_PATH if pg_dump isn't on the PATH.
 */

// pg_dump's timeout: long enough for a real dump, short enough that a stalled
// connection doesn't hang the worker (and block the next scheduled run) forever.
const PG_DUMP_TIMEOUT_MS = 5 * 60 * 1000;

/** Local copies stay in apps/worker/backups (gitignored); deployed, a temporary folder. */
export const LOCAL_BACKUP_DIR = path.resolve(__dirname, "../../backups");
/** Deployed backups go to a temporary folder and are deleted once uploaded. */
export const DEPLOYED_BACKUP_DIR = path.join(os.tmpdir(), "zaks-backups");

export interface BackupOptions {
  /** Where to upload; null keeps the backup local only. */
  storage?: { client: S3Client; bucket: string } | null;
  /** Folder for the backup file. */
  outDir?: string;
  /** Delete the local file once it is uploaded (deployed: the container's disk doesn't last). */
  removeAfterUpload?: boolean;
  databaseUrl?: string;
  pgDumpPath?: string;
  now?: Date;
}

export interface BackupResult {
  name: string;
  size: number;
  /** The local file, unless it was removed after the upload. */
  file: string | null;
  uploaded: StoredBackup | null;
}

/** "zaks-backup-2026-10-15T18-00-00Z.sql.gz": sorts by time, safe in any file system. */
export function backupName(now: Date): string {
  return `zaks-backup-${now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-")}.sql.gz`;
}

function runPgDump(pgDumpPath: string, databaseUrl: string, outFile: string): Promise<void> {
  // The connection string goes straight through: libpq's own URI parser handles
  // percent-decoding and query parameters (sslmode and so on) correctly.
  return new Promise((resolve, reject) => {
    execFile(
      pgDumpPath,
      [databaseUrl, "--format=plain", "--no-owner", "--no-acl", "--file", outFile],
      { timeout: PG_DUMP_TIMEOUT_MS },
      (error, _stdout, stderr) => {
        if (!error) return resolve();
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return reject(
            new Error(`pg_dump wasn't found ("${pgDumpPath}"). Install the PostgreSQL 18 client, or set PG_DUMP_PATH to pg_dump's location.`)
          );
        }
        reject(new Error(`pg_dump failed: ${stderr.trim() || error.message}`));
      }
    );
  });
}

export async function backupDatabase(options: BackupOptions = {}): Promise<BackupResult> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const pgDumpPath = options.pgDumpPath ?? (process.env.PG_DUMP_PATH || "pg_dump");
  const outDir = options.outDir ?? LOCAL_BACKUP_DIR;
  await mkdir(outDir, { recursive: true });

  const name = backupName(options.now ?? new Date());
  const sqlFile = path.join(outDir, name.replace(/\.gz$/, ""));
  const gzFile = path.join(outDir, name);
  try {
    await runPgDump(pgDumpPath, databaseUrl, sqlFile);
    await pipeline(createReadStream(sqlFile), createGzip({ level: 9 }), createWriteStream(gzFile));
  } finally {
    await rm(sqlFile, { force: true });
  }
  const { size } = await stat(gzFile);
  console.log(`[backup] wrote ${name} (${(size / 1024).toFixed(1)} KB)`);

  let uploaded: StoredBackup | null = null;
  if (options.storage) {
    try {
      uploaded = await uploadBackup(options.storage.client, options.storage.bucket, name, await readFile(gzFile));
    } catch (err) {
      throw new Error(`upload failed: ${describeStorageError(err)} The backup is still at ${gzFile}.`);
    }
    console.log(`[backup] uploaded ${uploaded.key} to bucket "${options.storage.bucket}"`);
    if (options.removeAfterUpload) await rm(gzFile, { force: true });
  }
  return { name, size, file: options.storage && options.removeAfterUpload ? null : gzFile, uploaded };
}

if (require.main === module) {
  // `npm run backup:now`: one backup, uploaded too when cloud storage is set up.
  const config = readStorageSettings();
  console.log(`[backup] ${describeStorageConfig(config)}`);
  const storage = config.ok ? { client: createStorageClient(config.settings), bucket: config.settings.bucket } : null;
  backupDatabase({ storage, outDir: LOCAL_BACKUP_DIR })
    .then(({ file, uploaded }) => {
      console.log(`Backup complete: ${uploaded ? uploaded.key : ""}${uploaded && file ? " (local copy: " : ""}${file ?? ""}${uploaded && file ? ")" : ""}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[backup] ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}
