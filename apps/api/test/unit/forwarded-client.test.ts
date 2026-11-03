import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardedClientAddress } from "../../src/middleware/forwardedClient";

// Staff sign-in arrives through the admin site, which passes the person's own address
// along with AUTH_PROXY_SECRET. Only then does req.ip (what the sign-in limits count)
// become that address.

const app = express();
app.use(forwardedClientAddress);
app.get("/ip", (req, res) => res.json({ ip: req.ip }));

const SECRET = "test-proxy-secret";
const ipOf = async (headers: Record<string, string>) => (await request(app).get("/ip").set(headers)).body.ip as string;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("forwardedClientAddress", () => {
  it("uses the forwarded address when the admin site's secret is right", async () => {
    vi.stubEnv("AUTH_PROXY_SECRET", SECRET);

    expect(await ipOf({ "X-Auth-Proxy-Secret": SECRET, "X-Client-Address": "203.0.113.7" })).toBe("203.0.113.7");
  });

  it("ignores the forwarded address with a wrong secret", async () => {
    vi.stubEnv("AUTH_PROXY_SECRET", SECRET);

    expect(await ipOf({ "X-Auth-Proxy-Secret": "guess", "X-Client-Address": "203.0.113.7" })).not.toBe("203.0.113.7");
  });

  it("ignores it when no secret is set on the API, whatever the request says", async () => {
    vi.stubEnv("AUTH_PROXY_SECRET", "");

    expect(await ipOf({ "X-Auth-Proxy-Secret": "", "X-Client-Address": "203.0.113.7" })).not.toBe("203.0.113.7");
  });

  it("keeps at most 64 characters of the address", async () => {
    vi.stubEnv("AUTH_PROXY_SECRET", SECRET);

    expect(await ipOf({ "X-Auth-Proxy-Secret": SECRET, "X-Client-Address": "x".repeat(100) })).toHaveLength(64);
  });
});
