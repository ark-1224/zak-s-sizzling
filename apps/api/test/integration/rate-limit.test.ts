import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, PRODUCTS, USERS } from "./fixtures";
import { app, kioskToken } from "./helpers";

// Rate limits on signing in, placing orders and starting kiosk sessions
// (middleware/rateLimit.ts). The limits are lowered here through their environment
// variables, which the API reads on every request, and put back afterwards. Each test
// file loads its own copy of the API, so the counts here never reach other files.
// The address-wide limits run last, since they stop every request of that kind from
// this address for the rest of the file.

const LIMITS = {
  RATE_LIMIT_LOGIN_FAILURES: "3",
  RATE_LIMIT_LOGIN_FAILURES_PER_ADDRESS: "20",
  RATE_LIMIT_ORDERS_PER_MINUTE: "3",
  RATE_LIMIT_ORDERS_PER_MINUTE_PER_ADDRESS: "8",
  RATE_LIMIT_KIOSK_SESSIONS_PER_MINUTE: "15",
  RATE_LIMIT_PAYMENT_STARTS_PER_SESSION: "2",
  RATE_LIMIT_REFRESH_PER_MINUTE: "3",
};
const previous: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [name, value] of Object.entries(LIMITS)) {
    previous[name] = process.env[name];
    process.env[name] = value;
  }
});

afterAll(() => {
  for (const name of Object.keys(LIMITS)) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });
const order = (token: string) =>
  request(app)
    .post("/api/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({ items: [{ productId: PRODUCTS.water.id, qty: 1 }], paymentMethod: "counter" });

describe("signing in", () => {
  it("refuses a 4th wrong password for the same account with 429 and a Retry-After header", async () => {
    for (let i = 0; i < 3; i++) expect((await login(USERS.admin.email, "wrong-password")).status).toBe(401);

    const res = await login(USERS.admin.email, "wrong-password");

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/^Too many failed sign-in attempts\. Try again in \d+ minutes?\.$/);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(15 * 60);
  });

  it("keeps the account locked from this address even with the right password, until the window ends", async () => {
    const res = await login(USERS.admin.email, PASSWORD);

    expect(res.status).toBe(429);
  });

  it("lets no more than the limit through when many wrong passwords arrive at once", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => login("burst@test.local", "wrong-password")));
    const statuses = results.map((r) => r.status);

    expect(statuses.filter((s) => s === 401)).toHaveLength(3);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });

  it("never limits correct sign-ins", async () => {
    for (let i = 0; i < 5; i++) expect((await login(USERS.staff.email, PASSWORD)).status).toBe(200);
  });

  it("starts the count again after a successful sign-in", async () => {
    for (let i = 0; i < 2; i++) expect((await login(USERS.staff.email, "wrong-password")).status).toBe(401);
    expect((await login(USERS.staff.email, PASSWORD)).status).toBe(200);

    // Three more wrong passwords are allowed again before the limit applies.
    for (let i = 0; i < 3; i++) expect((await login(USERS.staff.email, "wrong-password")).status).toBe(401);
    expect((await login(USERS.staff.email, "wrong-password")).status).toBe(429);
  });

  it("treats the email without regard to case or spaces", async () => {
    const res = await login(`  ${USERS.staff.email.toUpperCase()} `, "wrong-password");

    expect(res.status).toBe(429);
  });
});

describe("placing orders", () => {
  it("refuses a 4th order within a minute from the same kiosk session, with Retry-After", async () => {
    const session = await kioskToken();
    for (let i = 0; i < 3; i++) expect((await order(session)).status).toBe(201);

    const res = await order(session);

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/^Too many orders in a short time\. Please wait \d+ seconds? and try again\.$/);
    expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(60);
  });

  it("still takes orders from another kiosk session at the same address", async () => {
    const other = await kioskToken();

    expect((await order(other)).status).toBe(201);
  });

  it("can't be dodged by starting a new kiosk session for every order", async () => {
    // A fresh session per order never meets the per-session limit; the address limit stops it.
    let last = 0;
    let message = "";
    for (let i = 0; i < 12 && last !== 429; i++) {
      const res = await order(await kioskToken());
      last = res.status;
      message = res.body.error ?? "";
    }

    expect(last).toBe(429);
    expect(message).toMatch(/^Too many orders from this network\./);
  });
});

describe("starting an online payment", () => {
  it("refuses a 3rd payment start from the same kiosk session, suggesting the counter", async () => {
    const session = await kioskToken();
    const start = () =>
      request(app)
        .post("/api/payments/intent")
        .set("Authorization", `Bearer ${session}`)
        .send({ orderId: "99999999-9999-4999-8999-999999999999", method: "gcash" });
    // Any answer counts toward the limit: these find no such order.
    for (let i = 0; i < 2; i++) expect((await start()).status).toBe(404);

    const res = await start();

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/^Too many payment attempts\. Please wait \d+ minutes?, or pay at the counter\.$/);
    expect(Number(res.headers["retry-after"])).toBeLessThanOrEqual(10 * 60);
  });
});

describe("limits for a whole address", () => {
  it("refuses sign-ins once the address reaches its limit, whatever the email", async () => {
    let last = 0;
    let message = "";
    for (let i = 0; i < 25 && last !== 429; i++) {
      const res = await login(`nobody-${i}@test.local`, "wrong-password");
      last = res.status;
      message = res.body.error ?? "";
    }

    expect(last).toBe(429);
    expect(message).toMatch(/from this network/);
  });

  it("refuses new kiosk sessions once the address reaches its limit", async () => {
    let last = 0;
    for (let i = 0; i < 20 && last !== 429; i++) last = (await request(app).post("/api/auth/kiosk-session")).status;

    expect(last).toBe(429);
  });

  it("refuses sign-in renewals once the address reaches its limit", async () => {
    // Without a refresh cookie each renewal is refused (401), but every one counts.
    for (let i = 0; i < 3; i++) expect((await request(app).post("/api/auth/refresh")).status).toBe(401);

    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/^Too many sign-in renewals from this network\./);
  });
});
