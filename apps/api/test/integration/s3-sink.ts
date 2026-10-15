import { createServer, type IncomingMessage, type Server } from "node:http";

/**
 * A minimal S3-compatible server for tests: keeps uploaded objects in memory and serves
 * the three requests the worker's backups make, in path style (/bucket/key):
 * PutObject, ListObjectsV2 and GetObject. It doesn't check signatures. Setting
 * `refuse` makes every request fail with that S3 error code.
 */

export interface StoredObject {
  body: Buffer;
  contentType: string | undefined;
  lastModified: Date;
}

export interface S3Sink {
  endpoint: string;
  objects: Map<string, StoredObject>;
  /** Every request seen, as "METHOD /path". */
  requests: string[];
  refuse: { code: string; status: number } | null;
  close(): Promise<void>;
}

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function startS3Sink(bucket: string): Promise<S3Sink> {
  const sink: Omit<S3Sink, "endpoint" | "close"> = { objects: new Map(), requests: [], refuse: null };

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    sink.requests.push(`${req.method} ${url.pathname}`);
    const body = await readBody(req);
    const xml = (status: number, content: string) => {
      res.writeHead(status, { "Content-Type": "application/xml" });
      res.end(`<?xml version="1.0" encoding="UTF-8"?>${content}`);
    };

    if (sink.refuse) {
      return xml(sink.refuse.status, `<Error><Code>${sink.refuse.code}</Code><Message>Refused by the test server</Message></Error>`);
    }
    const [, bucketInPath, ...keyParts] = url.pathname.split("/");
    if (bucketInPath !== bucket) return xml(404, "<Error><Code>NoSuchBucket</Code><Message>No such bucket</Message></Error>");
    const key = decodeURIComponent(keyParts.join("/"));

    if (req.method === "PUT" && key) {
      sink.objects.set(key, { body, contentType: req.headers["content-type"], lastModified: new Date() });
      res.writeHead(200, { ETag: '"test"' });
      return res.end();
    }
    if (req.method === "GET" && !key && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const contents = [...sink.objects]
        .filter(([k]) => k.startsWith(prefix))
        .map(
          ([k, o]) =>
            `<Contents><Key>${xmlEscape(k)}</Key><LastModified>${o.lastModified.toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`
        )
        .join("");
      return xml(200, `<ListBucketResult><Name>${bucket}</Name><Prefix>${xmlEscape(prefix)}</Prefix><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
    }
    if (req.method === "GET" && key) {
      const object = sink.objects.get(key);
      if (!object) return xml(404, "<Error><Code>NoSuchKey</Code><Message>No such key</Message></Error>");
      res.writeHead(200, { "Content-Type": object.contentType ?? "application/octet-stream", "Content-Length": object.body.length });
      return res.end(object.body);
    }
    xml(400, "<Error><Code>NotImplemented</Code><Message>Not supported by the test server</Message></Error>");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return Object.assign(sink, {
    endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  });
}
