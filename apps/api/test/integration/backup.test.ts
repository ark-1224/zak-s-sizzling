import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backupDatabase } from "../../../worker/src/jobs/backupDatabase";
import { createStorageClient, downloadBackup, listBackups } from "../../../worker/src/lib/storage";
import { PRODUCTS } from "./fixtures";
import { startS3Sink, type S3Sink } from "./s3-sink";

// Cloud backups: a real pg_dump of the *_test database, compressed and uploaded to an
// S3-compatible server running inside the test (s3-sink.ts), then listed and
// downloaded back. Needs pg_dump 18 (set PG_DUMP_PATH, or have it on the PATH);
// without it the tests that run pg_dump are skipped, and say so.

const pgDump = process.env.PG_DUMP_PATH || "pg_dump";
const hasPgDump = spawnSync(pgDump, ["--version"], { encoding: "utf8" }).stdout?.startsWith("pg_dump");
const BUCKET = "zaks-test-backups";

let sink: S3Sink;
let outDir: string;
const storage = () => ({
  client: createStorageClient(
    { endpoint: sink.endpoint, region: "us-east-1", bucket: BUCKET, accessKeyId: "test-key", secretAccessKey: "test-secret" },
    { maxAttempts: 1 }
  ),
  bucket: BUCKET,
});

beforeAll(async () => {
  sink = await startS3Sink(BUCKET);
  outDir = await mkdtemp(path.join(os.tmpdir(), "zaks-backup-test-"));
});
afterAll(async () => {
  await sink.close();
  await rm(outDir, { recursive: true, force: true });
});

describe.skipIf(!hasPgDump)("a backup to cloud storage", () => {
  let key = "";

  it("dumps the whole database, compresses it, uploads it, and deletes the local copy", async () => {
    const result = await backupDatabase({ storage: storage(), outDir, removeAfterUpload: true, pgDumpPath: pgDump });

    expect(result.uploaded?.key).toMatch(/^database-backups\/zaks-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.sql\.gz$/);
    expect(result.file).toBeNull();
    expect(await readdir(outDir)).toEqual([]);
    key = result.uploaded!.key;
    const stored = sink.objects.get(key)!;
    expect(stored.contentType).toBe("application/gzip");
    expect(stored.body.length).toBe(result.size);
    expect(sink.requests).toContain(`PUT /${BUCKET}/${key}`);

    const sql = gunzipSync(stored.body).toString("utf8");
    expect(sql).toContain("CREATE TABLE public.products");
    expect(sql).toContain("COPY public.orders");
    expect(sql).toContain(PRODUCTS.sisig.name);
    // The low-stock triggers are part of the database, so they're in the backup too.
    expect(sql).toContain("CREATE TRIGGER inventory_low_stock_alert");
    // No owners or privileges, so it restores into any database.
    expect(sql).not.toMatch(/ALTER TABLE .* OWNER TO/);
  });

  it("finds it in the bucket and downloads exactly what was uploaded", async () => {
    const client = storage().client;

    const [newest] = await listBackups(client, BUCKET);

    expect(newest.key).toBe(key);
    expect((await downloadBackup(client, BUCKET, key)).equals(sink.objects.get(key)!.body)).toBe(true);
  });

  it("keeps the local copy, and says why, when the bucket refuses the upload", async () => {
    sink.refuse = { code: "AccessDenied", status: 403 };
    try {
      const error = await backupDatabase({ storage: storage(), outDir, removeAfterUpload: true, pgDumpPath: pgDump }).catch((e: Error) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/^upload failed: The key isn't allowed to use this bucket\. .* The backup is still at /);
      const [kept] = await readdir(outDir);
      expect(kept).toMatch(/\.sql\.gz$/);
      expect(existsSync(path.join(outDir, kept.replace(/\.gz$/, "")))).toBe(false); // the uncompressed dump is never left behind
    } finally {
      sink.refuse = null;
    }
  });
});

describe.skipIf(!hasPgDump)("a failed backup", () => {
  it("never shows the database password, even when pg_dump can't connect", async () => {
    const error = await backupDatabase({
      storage: null,
      outDir,
      pgDumpPath: pgDump,
      databaseUrl: "postgresql://zaks:Sup3r-Secret@127.0.0.1:1/railway?connect_timeout=3",
    }).catch((e: Error) => e);

    expect((error as Error).message).toMatch(/^pg_dump failed: /);
    expect((error as Error).message).not.toContain("Sup3r-Secret");
  });
});

describe("a backup without pg_dump", () => {
  it("says pg_dump wasn't found and how to fix it", async () => {
    const error = await backupDatabase({ storage: null, outDir, pgDumpPath: "no-such-pg_dump" }).catch((e: Error) => e);

    expect((error as Error).message).toMatch(/^pg_dump wasn't found \("no-such-pg_dump"\)\. Install the PostgreSQL 18 client, or set PG_DUMP_PATH/);
  });
});
