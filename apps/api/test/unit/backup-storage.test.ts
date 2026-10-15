import { describe, expect, it } from "vitest";
// The worker's backup storage settings (Cloud backups). No storage service is contacted.
import type { S3Client } from "@aws-sdk/client-s3";
import { backupName } from "../../../worker/src/jobs/backupDatabase";
import { databaseName } from "../../../worker/src/jobs/restoreCheck";
import {
  describeStorageConfig,
  describeStorageError,
  listBackups,
  readStorageSettings,
  regionFor,
} from "../../../worker/src/lib/storage";

const B2 = {
  BACKUP_STORAGE_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
  BACKUP_STORAGE_KEY: "004a1b2c3d4e5f60000000001",
  BACKUP_STORAGE_SECRET: "K004very/secret+value",
  BACKUP_STORAGE_BUCKET: "zaks-sizzling-hub-backups",
};

describe("reading the backup storage settings", () => {
  it("is off, naming each missing setting, when nothing is set", () => {
    const config = readStorageSettings({});

    expect(config).toEqual({
      ok: false,
      missing: ["BACKUP_STORAGE_ENDPOINT", "BACKUP_STORAGE_KEY", "BACKUP_STORAGE_SECRET", "BACKUP_STORAGE_BUCKET"],
      problems: [],
    });
    expect(describeStorageConfig(config)).toMatch(/^cloud backups off \(set BACKUP_STORAGE_ENDPOINT/);
  });

  it("reads Backblaze B2 settings, taking the region from the endpoint, and never logs the key or secret", () => {
    const config = readStorageSettings(B2);

    expect(config).toEqual({
      ok: true,
      settings: {
        endpoint: "https://s3.us-west-004.backblazeb2.com",
        region: "us-west-004",
        bucket: "zaks-sizzling-hub-backups",
        accessKeyId: B2.BACKUP_STORAGE_KEY,
        secretAccessKey: B2.BACKUP_STORAGE_SECRET,
      },
    });
    const line = describeStorageConfig(config);
    expect(line).toBe('cloud backups on: bucket "zaks-sizzling-hub-backups" at s3.us-west-004.backblazeb2.com');
    expect(line).not.toContain(B2.BACKUP_STORAGE_KEY);
    expect(line).not.toContain(B2.BACKUP_STORAGE_SECRET);
  });

  it("accepts an endpoint written without https://, as providers often show it", () => {
    expect(readStorageSettings({ ...B2, BACKUP_STORAGE_ENDPOINT: "s3.us-west-004.backblazeb2.com" })).toMatchObject({
      ok: true,
      settings: { endpoint: "https://s3.us-west-004.backblazeb2.com" },
    });
  });

  it("reports an endpoint that isn't a web address", () => {
    expect(readStorageSettings({ ...B2, BACKUP_STORAGE_ENDPOINT: "https://not a host" })).toMatchObject({
      ok: false,
      problems: [expect.stringMatching(/BACKUP_STORAGE_ENDPOINT isn't a web address/)],
    });
  });

  it("uses each provider's signing region", () => {
    expect(regionFor(new URL("https://0123abcd.r2.cloudflarestorage.com"))).toBe("auto");
    expect(regionFor(new URL("https://s3.ap-southeast-1.amazonaws.com"))).toBe("ap-southeast-1");
    expect(regionFor(new URL("https://s3.example.com"))).toBe("us-east-1");
    expect(regionFor(new URL("https://s3.example.com"), "eu-central")).toBe("eu-central");
  });
});

describe("naming and finding backups", () => {
  it("names a backup by its time in UTC, safe for any file system", () => {
    expect(backupName(new Date("2026-10-15T18:00:00.123Z"))).toBe("zaks-backup-2026-10-15T18-00-00Z.sql.gz");
  });

  it("lists the backups newest first, across pages", async () => {
    const pages = [
      { Contents: [{ Key: "database-backups/a.sql.gz", Size: 10, LastModified: new Date("2026-10-13T18:00:00Z") }], IsTruncated: true, NextContinuationToken: "next" },
      { Contents: [{ Key: "database-backups/b.sql.gz", Size: 12, LastModified: new Date("2026-10-14T18:00:00Z") }], IsTruncated: false },
    ];
    const tokens: (string | undefined)[] = [];
    const client = {
      send: async (command: { input: { ContinuationToken?: string; Prefix?: string } }) => {
        tokens.push(command.input.ContinuationToken);
        expect(command.input.Prefix).toBe("database-backups/");
        return pages[tokens.length - 1];
      },
    } as unknown as S3Client;

    const backups = await listBackups(client, "bucket");

    expect(backups.map((b) => b.key)).toEqual(["database-backups/b.sql.gz", "database-backups/a.sql.gz"]);
    expect(tokens).toEqual([undefined, "next"]);
  });

  it("reads the database name a restore would go into", () => {
    expect(databaseName("postgresql://u:p@localhost:5432/zaks_restore_check?schema=public")).toBe("zaks_restore_check");
    expect(databaseName("not a url")).toBeNull();
  });
});

describe("explaining a storage error", () => {
  const error = (Code: string, httpStatusCode: number) => Object.assign(new Error(Code), { Code, name: Code, $metadata: { httpStatusCode } });

  it("points a refused key at the key ID and secret", () => {
    expect(describeStorageError(error("InvalidAccessKeyId", 403))).toMatch(/BACKUP_STORAGE_KEY and BACKUP_STORAGE_SECRET/);
    expect(describeStorageError(error("SignatureDoesNotMatch", 403))).toMatch(/BACKUP_STORAGE_KEY and BACKUP_STORAGE_SECRET/);
  });

  it("points a key without access at the bucket's permissions", () => {
    expect(describeStorageError(error("AccessDenied", 403))).toMatch(/read and write access/);
  });

  it("tells a missing backup apart from a missing bucket", () => {
    expect(describeStorageError(error("NoSuchKey", 404))).toMatch(/That backup isn't in the bucket/);
    expect(describeStorageError(error("NoSuchBucket", 404))).toMatch(/The bucket wasn't found/);
  });

  it("points an unreachable service at the endpoint", () => {
    expect(describeStorageError(Object.assign(new Error("getaddrinfo ENOTFOUND s3.nowhere"), { code: "ENOTFOUND" }))).toMatch(/Could not reach/);
  });
});
