import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/lib/prisma";
import { PASSWORD, USERS } from "./fixtures";
import { app, loginAs } from "./helpers";

// Emailed sign-in codes (auth/loginCodes.ts): after a correct password the API emails a
// 6-digit code through Brevo, and only that code starts the session. Brevo is simulated:
// fetch calls to api.brevo.com are answered here and the codes read from them. The other
// test files sign in without codes (LOGIN_CODES=off in vitest.config.mts).

const realFetch = globalThis.fetch;
const SETTINGS = { LOGIN_CODES: "on", BREVO_API_KEY: "xkeysib-test-not-a-real-key", LOGIN_CODE_FROM: "codes@test.local" } as const;
const saved = Object.fromEntries(
  [...Object.keys(SETTINGS), "RATE_LIMIT_LOGIN_FAILURES_PER_ADDRESS"].map((name) => [name, process.env[name]])
);

interface SentEmail {
  apiKey: string | null;
  sender: { name: string; email: string };
  to: { email: string; name: string }[];
  subject: string;
  textContent: string;
}
let sent: SentEmail[] = [];
/** When set, Brevo answers every email with this error. */
let brevoRefuses: { status: number; message: string } | null = null;

const fakeBrevo = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://api.brevo.com/")) return realFetch(input, init);
  if (brevoRefuses) {
    return new Response(JSON.stringify({ code: "error", message: brevoRefuses.message }), { status: brevoRefuses.status });
  }
  const headers = new Headers(init?.headers);
  sent.push({ apiKey: headers.get("api-key"), ...JSON.parse(String(init?.body)) });
  return new Response(JSON.stringify({ messageId: `<${sent.length}@brevo.test>` }), { status: 201 });
});

/** The code in the newest email, read from its subject ("123456 is your ... code"). */
function lastCode(): string {
  const match = sent.at(-1)?.subject.match(/^(\d{6}) /);
  if (!match) throw new Error("No sign-in code was emailed");
  return match[1];
}

const signIn = (email: string, password = PASSWORD) => request(app).post("/api/auth/login").send({ email, password });
const verify = (challengeId: string, code: string) => request(app).post("/api/auth/login/verify").send({ challengeId, code });
const resend = (challengeId: string) => request(app).post("/api/auth/login/resend").send({ challengeId });

/** A code another than the right one. */
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

/** Pretends a challenge's email went out `seconds` ago. */
const sentAgo = (challengeId: string, seconds: number) =>
  prisma.loginCode.update({ where: { id: challengeId }, data: { sentAt: new Date(Date.now() - seconds * 1000) } });

beforeAll(() => {
  Object.assign(process.env, SETTINGS);
  // Many wrong codes on purpose; the per-address limit has its own tests (rate-limit.test.ts).
  process.env.RATE_LIMIT_LOGIN_FAILURES_PER_ADDRESS = "100000";
  vi.stubGlobal("fetch", fakeBrevo);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await prisma.loginCode.deleteMany();
});

beforeEach(async () => {
  sent = [];
  brevoRefuses = null;
  fakeBrevo.mockClear();
  await prisma.loginCode.deleteMany();
});

describe("signing in with an emailed code", () => {
  it("emails a code after a correct password, without starting a session yet", async () => {
    const res = await signIn(USERS.staff.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      codeRequired: true,
      challengeId: expect.any(String),
      sentTo: "st•••@test.local",
      expiresInSeconds: 600,
      resendInSeconds: 60,
    });
    expect(res.body).not.toHaveProperty("accessToken");
    expect(res.headers["set-cookie"]).toBeUndefined();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      apiKey: SETTINGS.BREVO_API_KEY,
      sender: { name: "Zak's Sizzling Hub", email: SETTINGS.LOGIN_CODE_FROM },
      to: [{ email: USERS.staff.email, name: USERS.staff.name }],
    });
    expect(sent[0].subject).toMatch(/^\d{6} is your Zak's Sizzling Hub sign-in code$/);
    expect(sent[0].textContent).toContain(`Your sign-in code is ${lastCode()}. It works for 10 minutes.`);
  });

  it("keeps only a hash of the code", async () => {
    const { body } = await signIn(USERS.staff.email);
    const row = await prisma.loginCode.findUniqueOrThrow({ where: { id: body.challengeId } });

    expect(row.codeHash).not.toContain(lastCode());
    expect(await bcrypt.compare(lastCode(), row.codeHash)).toBe(true);
  });

  it("starts the session with the right code: access token, refresh cookie and the account", async () => {
    const { body } = await signIn(USERS.admin.email);
    const res = await verify(body.challengeId, lastCode());

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: USERS.admin.email, role: "admin" });
    expect(String(res.headers["set-cookie"])).toMatch(/zaks_refresh=.*HttpOnly/i);

    const me = await request(app).get("/api/users/me").set("Authorization", `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("accepts the code with a space or dash in it, as pasted from the email", async () => {
    const { body } = await signIn(USERS.staff.email);
    const code = lastCode();

    expect((await verify(body.challengeId, ` ${code.slice(0, 3)} ${code.slice(3)} `)).status).toBe(200);
  });

  it("refuses a code that isn't 6 digits without using up a try", async () => {
    const { body } = await signIn(USERS.staff.email);

    const res = await verify(body.challengeId, "12ab56");
    expect(res.status).toBe(400);
    expect((await prisma.loginCode.findUniqueOrThrow({ where: { id: body.challengeId } })).attempts).toBe(0);
  });

  it("works only once", async () => {
    const { body } = await signIn(USERS.staff.email);
    const code = lastCode();

    expect((await verify(body.challengeId, code)).status).toBe(200);
    const again = await verify(body.challengeId, code);
    expect(again.status).toBe(410);
    expect(again.body.error).toBe("This sign-in has ended. Sign in again to get a new code.");
  });

  it("counts down the tries left on a wrong code, and ends the sign-in after 5", async () => {
    const { body } = await signIn(USERS.staff.email);
    const code = lastCode();

    for (const left of [4, 3, 2, 1]) {
      const res = await verify(body.challengeId, wrong(code));
      expect(res.status).toBe(401);
      expect(res.body.error).toBe(`That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`);
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    const fifth = await verify(body.challengeId, wrong(code));
    expect(fifth.status).toBe(410);
    expect(fifth.body.error).toBe("Too many wrong codes. Sign in again to get a new code.");

    // Even the right code no longer works.
    expect((await verify(body.challengeId, code)).status).toBe(410);
  });

  it("gives 5 tries in total even when wrong codes arrive at the same moment", async () => {
    const { body } = await signIn(USERS.staff.email);
    const code = lastCode();

    await Promise.all(Array.from({ length: 8 }, () => verify(body.challengeId, wrong(code))));
    expect((await prisma.loginCode.findUniqueOrThrow({ where: { id: body.challengeId } })).attempts).toBe(5);
    expect((await verify(body.challengeId, code)).status).toBe(410);
  });

  it("starts only one session when the right code arrives twice at the same moment", async () => {
    const { body } = await signIn(USERS.staff.email);
    const code = lastCode();

    const results = await Promise.all([verify(body.challengeId, code), verify(body.challengeId, code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it("refuses an expired code", async () => {
    const { body } = await signIn(USERS.staff.email);
    await prisma.loginCode.update({ where: { id: body.challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await verify(body.challengeId, lastCode());
    expect(res.status).toBe(410);
    expect(res.body.error).toBe("The code has expired. Sign in again to get a new code.");
  });

  it("refuses a sign-in that doesn't exist", async () => {
    const res = await verify("99999999-9999-4999-8999-999999999999", "123456");
    expect(res.status).toBe(410);
  });

  it("makes an earlier code stop working when the account signs in again", async () => {
    const first = await signIn(USERS.staff.email);
    const firstCode = lastCode();
    const second = await signIn(USERS.staff.email);

    expect((await verify(first.body.challengeId, firstCode)).status).toBe(410);
    expect((await verify(second.body.challengeId, lastCode())).status).toBe(200);
  });

  it("doesn't let one account's code finish another account's sign-in", async () => {
    const staff = await signIn(USERS.staff.email);
    const staffCode = lastCode();
    const admin = await signIn(USERS.admin.email);

    const res = await verify(admin.body.challengeId, staffCode);
    // The two codes could match by chance (1 in a million); then the admin signs in, as it should.
    if (staffCode !== lastCode()) expect(res.status).toBe(401);
    expect((await verify(staff.body.challengeId, staffCode)).body.user.email).toBe(USERS.staff.email);
  });

  it("sends no email for a wrong password, an unknown email or a suspended account", async () => {
    expect((await signIn(USERS.staff.email, "wrong-password")).status).toBe(401);
    expect((await signIn("nobody@test.local")).status).toBe(401);
    expect((await signIn(USERS.suspended.email)).status).toBe(401);
    expect(sent).toHaveLength(0);
    expect(await prisma.loginCode.count()).toBe(0);
  });

  it("signs in with the password alone when LOGIN_CODES is off", async () => {
    process.env.LOGIN_CODES = "off";
    try {
      const res = await signIn(USERS.staff.email);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(sent).toHaveLength(0);
    } finally {
      process.env.LOGIN_CODES = "on";
    }
  });
});

describe("when the email can't be sent", () => {
  it("doesn't sign in, says to try again, and doesn't count the attempt", async () => {
    brevoRefuses = { status: 401, message: "Key not found" };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await signIn(USERS.staff.email);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("We couldn't send your sign-in code. Try again in a minute, or ask an admin for help.");
    expect(res.body).not.toHaveProperty("accessToken");
    expect(await prisma.loginCode.count()).toBe(0);
    // The reason goes to the API's log, not to the person signing in.
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("Brevo refused the API key"));
    errors.mockRestore();
  });

  it("refuses to sign in in production when Brevo isn't set up", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BREVO_API_KEY", "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await signIn(USERS.staff.email)).status).toBe(503);
      expect(errors).toHaveBeenCalledWith(expect.stringContaining("set BREVO_API_KEY and LOGIN_CODE_FROM"));
    } finally {
      vi.unstubAllEnvs();
      errors.mockRestore();
    }
  });

  it("prints the code in the log instead outside production, so a laptop can still sign in", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { body } = await signIn(USERS.staff.email);
      const line = String(logs.mock.calls.find(([l]) => String(l).includes("sign-in email, not sent"))?.[0]);
      const code = line.match(/: (\d{6}) is your/)?.[1];

      expect(sent).toHaveLength(0);
      expect((await verify(body.challengeId, code!)).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
      logs.mockRestore();
    }
  });
});

describe("sending a new code", () => {
  it("waits 60 seconds after the last email", async () => {
    const { body } = await signIn(USERS.staff.email);

    const res = await resend(body.challengeId);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/^Wait (59|60) seconds before asking for a new code\.$/);
    expect(sent).toHaveLength(1);
  });

  it("emails a new code that replaces the old one", async () => {
    const { body } = await signIn(USERS.staff.email);
    const oldCode = lastCode();
    await sentAgo(body.challengeId, 61);

    const res = await resend(body.challengeId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ codeRequired: true, challengeId: body.challengeId, resendInSeconds: 60 });
    expect(sent).toHaveLength(2);

    const newCode = lastCode();
    if (newCode !== oldCode) expect((await verify(body.challengeId, oldCode)).status).toBe(401);
    expect((await verify(body.challengeId, newCode)).status).toBe(200);
  });

  it("allows 3 new codes per sign-in", async () => {
    const { body } = await signIn(USERS.staff.email);
    for (let i = 0; i < 3; i++) {
      await sentAgo(body.challengeId, 61);
      expect((await resend(body.challengeId)).status).toBe(200);
    }
    await sentAgo(body.challengeId, 61);

    const fourth = await resend(body.challengeId);
    expect(fourth.status).toBe(410);
    expect(fourth.body.error).toBe("That's the most codes for one sign-in. Sign in again to get a new code.");
    expect(sent).toHaveLength(4);
  });

  it("keeps the wrong tries already used", async () => {
    const { body } = await signIn(USERS.staff.email);
    for (let i = 0; i < 3; i++) await verify(body.challengeId, wrong(lastCode()));
    await sentAgo(body.challengeId, 61);
    await resend(body.challengeId);

    const res = await verify(body.challengeId, wrong(lastCode()));
    expect(res.body.error).toBe("That code isn't right. 1 try left.");
  });
});

describe("the hourly limit per account", () => {
  it("stops emailing an account after 10 codes in an hour", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: USERS.staff.email } });
    await prisma.loginCode.create({
      data: { userId: user.id, codeHash: "x", sends: 10, sentAt: new Date(Date.now() - 30 * 60 * 1000), expiresAt: new Date() },
    });

    const res = await signIn(USERS.staff.email);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("Too many sign-in codes were sent to this account in the last hour. Try again later.");
    expect(sent).toHaveLength(0);

    // Other accounts aren't affected.
    expect((await signIn(USERS.admin.email)).status).toBe(200);
  });

  it("counts only the last hour", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: USERS.staff.email } });
    await prisma.loginCode.create({
      data: { userId: user.id, codeHash: "x", sends: 10, sentAt: new Date(Date.now() - 61 * 60 * 1000), expiresAt: new Date() },
    });

    expect((await signIn(USERS.staff.email)).status).toBe(200);
  });
});

describe("account changes during a sign-in", () => {
  let temp: { id: string; email: string };
  let adminToken: string;

  beforeAll(async () => {
    process.env.LOGIN_CODES = "off";
    adminToken = await loginAs("admin");
    process.env.LOGIN_CODES = "on";
  });

  beforeEach(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "staff" } });
    temp = await prisma.user.create({
      data: { name: "Code Test", email: `code.test.${Date.now()}@test.local`, passwordHash: await bcrypt.hash(PASSWORD, 4), roleId: role.id },
    });
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { id: temp.id } });
  });

  const patch = (body: object) => request(app).patch(`/api/users/${temp.id}`).set("Authorization", `Bearer ${adminToken}`).send(body);

  it("ends a pending sign-in when the account is suspended", async () => {
    const { body } = await signIn(temp.email);
    expect((await patch({ isActive: false })).status).toBe(200);

    expect((await verify(body.challengeId, lastCode())).status).toBe(410);
  });

  it("ends a pending sign-in when an admin sets a new password", async () => {
    const { body } = await signIn(temp.email);
    expect((await patch({ password: "Another-Password-1" })).status).toBe(200);

    expect((await verify(body.challengeId, lastCode())).status).toBe(410);
  });

  it("ends a pending sign-in when the email changes, and sends the next code to the new address", async () => {
    const { body } = await signIn(temp.email);
    const changed = await patch({ email: "Maria.Santos.Codes@Gmail.com" });
    expect(changed.status).toBe(200);
    expect(changed.body.email).toBe("maria.santos.codes@gmail.com");

    expect((await verify(body.challengeId, lastCode())).status).toBe(410);
    const next = await signIn("maria.santos.codes@gmail.com");
    expect(next.body.sentTo).toBe("ma•••@gmail.com");
    expect(sent.at(-1)?.to).toEqual([{ email: "maria.santos.codes@gmail.com", name: "Code Test" }]);
  });

  it("refuses an email another account already has", async () => {
    const res = await patch({ email: USERS.admin.email });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("A user with that email already exists");
  });
});

describe("POST /api/users/:id/test-email", () => {
  let adminToken: string;
  beforeAll(async () => {
    process.env.LOGIN_CODES = "off";
    adminToken = await loginAs("admin");
    process.env.LOGIN_CODES = "on";
  });

  const testEmail = async (email: string) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return request(app).post(`/api/users/${user.id}/test-email`).set("Authorization", `Bearer ${adminToken}`);
  };

  it("emails the account so an admin can check the address works", async () => {
    const res = await testEmail(USERS.staff.email);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sentTo: USERS.staff.email, delivered: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([{ email: USERS.staff.email, name: USERS.staff.name }]);
    expect(sent[0].subject).toBe("Test email from Zak's Sizzling Hub");
  });

  it("tells the admin why Brevo refused, so it can be fixed", async () => {
    brevoRefuses = { status: 400, message: "Sender is not valid" };
    const res = await testEmail(USERS.staff.email);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe(
      "Brevo refused the sender. LOGIN_CODE_FROM must be a sender verified in Brevo (Senders, domains & IPs)."
    );
  });

  it("says when the email was only logged, on a computer without Brevo", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const res = await testEmail(USERS.staff.email);
      expect(res.body).toEqual({ sentTo: USERS.staff.email, delivered: false });
    } finally {
      vi.unstubAllEnvs();
      logs.mockRestore();
    }
  });

  it("answers 404 for an account that doesn't exist", async () => {
    const res = await request(app)
      .post("/api/users/99999999-9999-4999-8999-999999999999/test-email")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
