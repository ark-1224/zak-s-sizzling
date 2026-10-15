import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

/**
 * Off-site storage for database backups: any S3-compatible bucket (Backblaze B2,
 * Cloudflare R2, AWS S3). Set BACKUP_STORAGE_ENDPOINT, BACKUP_STORAGE_KEY,
 * BACKUP_STORAGE_SECRET and BACKUP_STORAGE_BUCKET for the worker (apps/worker/.env and
 * the Railway worker service). Without them, backups stay on the local disk only.
 */

export interface StorageSettings {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type StorageConfig =
  | { ok: true; settings: StorageSettings }
  | { ok: false; missing: string[]; problems: string[] };

/** Where backups go inside the bucket. */
export const BACKUP_PREFIX = "database-backups/";

/**
 * The signing region an S3-compatible endpoint expects: R2 always uses "auto", B2 and
 * AWS put it in the host name (s3.us-west-004.backblazeb2.com, s3.ap-southeast-1.amazonaws.com).
 * BACKUP_STORAGE_REGION overrides this for any other provider.
 */
export function regionFor(endpoint: URL, override?: string): string {
  if (override) return override;
  const host = endpoint.hostname;
  if (host.endsWith(".r2.cloudflarestorage.com")) return "auto";
  const match = /^s3\.([a-z0-9-]+)\.(?:backblazeb2|amazonaws)\.com$/.exec(host);
  return match ? match[1] : "us-east-1";
}

export function readStorageSettings(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const value = (name: string) => env[name]?.trim() ?? "";
  const missing = ["BACKUP_STORAGE_ENDPOINT", "BACKUP_STORAGE_KEY", "BACKUP_STORAGE_SECRET", "BACKUP_STORAGE_BUCKET"].filter(
    (name) => !value(name)
  );
  const problems: string[] = [];

  let endpoint: URL | null = null;
  const raw = value("BACKUP_STORAGE_ENDPOINT");
  if (raw) {
    try {
      // Providers often show the endpoint without the scheme.
      endpoint = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      problems.push("BACKUP_STORAGE_ENDPOINT isn't a web address, such as https://s3.us-west-004.backblazeb2.com");
    }
  }
  if (missing.length > 0 || problems.length > 0 || !endpoint) return { ok: false, missing, problems };

  return {
    ok: true,
    settings: {
      endpoint: endpoint.origin,
      region: regionFor(endpoint, value("BACKUP_STORAGE_REGION")),
      bucket: value("BACKUP_STORAGE_BUCKET"),
      accessKeyId: value("BACKUP_STORAGE_KEY"),
      secretAccessKey: value("BACKUP_STORAGE_SECRET"),
    },
  };
}

/** One line on where backups go, without any of the credentials, for the worker's log. */
export function describeStorageConfig(config: StorageConfig): string {
  if (config.ok) return `cloud backups on: bucket "${config.settings.bucket}" at ${new URL(config.settings.endpoint).hostname}`;
  const parts = [];
  if (config.missing.length > 0) parts.push(`set ${config.missing.join(", ")}`);
  parts.push(...config.problems);
  return `cloud backups off (${parts.join("; ")}; see .env.example)`;
}

export function createStorageClient(settings: StorageSettings, overrides: Partial<S3ClientConfig> = {}): S3Client {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    // Bucket in the path (endpoint/bucket/key): works on every S3-compatible provider.
    forcePathStyle: true,
    // Newer SDKs add CRC checksums to every request by default, which some
    // S3-compatible providers reject; only send them where the API requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
    ...overrides,
  });
}

export interface StoredBackup {
  key: string;
  size: number;
  lastModified: Date;
}

/** Uploads one backup file's contents under BACKUP_PREFIX. */
export async function uploadBackup(client: S3Client, bucket: string, name: string, body: Buffer): Promise<StoredBackup> {
  const key = `${BACKUP_PREFIX}${name}`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "application/gzip" }));
  return { key, size: body.length, lastModified: new Date() };
}

/** The backups in the bucket, newest first. */
export async function listBackups(client: S3Client, bucket: string): Promise<StoredBackup[]> {
  const found: StoredBackup[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: token }));
    for (const item of page.Contents ?? []) {
      if (item.Key && item.LastModified) found.push({ key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return found.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}

/** Downloads one backup's contents. */
export async function downloadBackup(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error(`The backup ${key} is empty`);
  return Buffer.from(await object.Body.transformToByteArray());
}

/** Turns the storage service's errors into something a person setting this up can act on. */
export function describeStorageError(err: unknown): string {
  const e = err as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } } | null;
  const code = e?.Code ?? e?.name ?? "";
  const status = e?.$metadata?.httpStatusCode;
  if (["InvalidAccessKeyId", "SignatureDoesNotMatch", "InvalidToken", "Unauthorized"].includes(code) || status === 401) {
    return "The storage service refused the key. Check BACKUP_STORAGE_KEY and BACKUP_STORAGE_SECRET (the key ID and the secret, not the key's name).";
  }
  if (code === "AccessDenied" || status === 403) {
    return "The key isn't allowed to use this bucket. Give it read and write access to BACKUP_STORAGE_BUCKET.";
  }
  if (code === "NoSuchKey") return "That backup isn't in the bucket. Leave the name out to use the newest one.";
  if (code === "NoSuchBucket" || status === 404) return "The bucket wasn't found. Check BACKUP_STORAGE_BUCKET and BACKUP_STORAGE_ENDPOINT.";
  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "TimeoutError"].includes(code) || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/.test(e?.message ?? "")) {
    return "Could not reach the storage service. Check BACKUP_STORAGE_ENDPOINT, and that this machine is online.";
  }
  return e?.message || String(err);
}
