import request from "supertest";
import { describe, expect, it } from "vitest";
import { PASSWORD, USERS } from "./fixtures";
import { app, kioskToken, loginAs } from "./helpers";

describe("POST /api/auth/login", () => {
  it("signs in an active admin and sets an httpOnly refresh cookie", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: USERS.admin.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: USERS.admin.email, name: USERS.admin.name, role: "admin" });
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/zaks_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it("treats the email as case-insensitive", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: USERS.staff.email.toUpperCase(), password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("staff");
  });

  it("rejects a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: USERS.admin.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("gives an unknown email the same error as a wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@test.local", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("rejects a suspended account even with the correct password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: USERS.suspended.email, password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 400 when the password is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: USERS.admin.email });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("POST /api/auth/refresh", () => {
  it("issues a new access token from the refresh cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: USERS.staff.email, password: PASSWORD }).expect(200);

    const res = await agent.post("/api/auth/refresh");

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(USERS.staff.email);
  });

  it("returns 401 without a refresh cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/kiosk-session", () => {
  it("issues an anonymous customer token without credentials", async () => {
    const res = await request(app).post("/api/auth/kiosk-session");

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
});

describe("role-based access control", () => {
  it("returns 401 on a staff route without a token", async () => {
    const res = await request(app).get("/api/orders");

    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await request(app).get("/api/orders").set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
  });

  it("blocks a kiosk customer from staff routes", async () => {
    const token = await kioskToken();

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("lets staff use staff routes", async () => {
    const token = await loginAs("staff");

    const res = await request(app).get("/api/orders").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("blocks staff from the admin-only user list", async () => {
    const token = await loginAs("staff");

    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("lets an admin list user accounts, without password hashes", async () => {
    const token = await loginAs("admin");

    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const emails = res.body.map((u: { email: string }) => u.email);
    expect(emails).toEqual(expect.arrayContaining([USERS.admin.email, USERS.staff.email, USERS.suspended.email]));
    expect(res.body[0]).not.toHaveProperty("passwordHash");
  });
});
