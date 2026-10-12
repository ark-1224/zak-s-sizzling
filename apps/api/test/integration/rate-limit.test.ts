import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PASSWORD, PRODUCTS, USERS } from "./fixtures";
import { app, kioskToken } from "./helpers";

// Rate limits on signing in and placing orders (middleware/rateLimit.ts). The limits
// are lowered here through their environment variables, which the API reads on every
// request, and put back afterwards. Each test file loads its own copy of the API, so
// the counts here never reach other files. The address-wide limit runs last, since it
// stops every sign-in from this address for the rest of the file.

const LIMITS = {
  RATE_LIMIT_LOGIN_FAILURES: "3",
  RATE_LIMIT_LOGIN_FAILURES_PER_ADDRESS: "9",
  RATE_LIMIT_ORDERS_PER_MINUTE: "3",
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
  const order = (token: string) =>
    request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: PRODUCTS.water.id, qty: 1 }], paymentMethod: "counter" });

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
});

describe("signing in from one address with many different emails", () => {
  it("refuses further attempts once the address reaches its limit", async () => {
    // 8 failed sign-ins from this address so far (3 for the admin, 2 + 3 for staff; the
    // 429s don't count). This 9th still gets the usual 401; then the address is at its limit.
    const res1 = await login("nobody-1@test.local", "wrong-password");
    expect(res1.status).toBe(401);

    const res = await login("nobody-2@test.local", "wrong-password");

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/from this network/);
  });
});
