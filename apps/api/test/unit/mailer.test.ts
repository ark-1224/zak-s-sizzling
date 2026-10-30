import { createServer, type Server } from "node:net";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The worker's email sender (Low-stock notifications 1/3), tested here like the worker's
// low-stock job is: from the api's test projects, since the worker has none of its own.
import {
  BrevoError,
  createBrevoMailer,
  createMailer,
  createResendMailer,
  describeMailConfig,
  describeMailError,
  mailerFromEnv,
  readMailSettings,
  RESEND_TEST_SENDER,
  ResendError,
  type MailSettings,
} from "../../../worker/src/lib/mailer";

const GMAIL = { SMTP_USER: "zaks.alerts@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop", ALERT_EMAIL_TO: "owner@example.com" };

describe("reading the email settings", () => {
  it("is off, naming each missing setting, when nothing is set", () => {
    const config = readMailSettings({});

    expect(config).toEqual({ ok: false, missing: ["SMTP_USER", "SMTP_PASS", "ALERT_EMAIL_TO"], problems: [] });
    expect(describeMailConfig(config)).toBe(
      "email alerts off (set SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO, or set BREVO_API_KEY, ALERT_EMAIL_FROM and ALERT_EMAIL_TO; see .env.example)"
    );
    expect(mailerFromEnv({})).toBeNull();
  });

  it("treats blank values as missing", () => {
    const config = readMailSettings({ ...GMAIL, SMTP_PASS: "   " });

    expect(config).toMatchObject({ ok: false, missing: ["SMTP_PASS"] });
  });

  it("uses Gmail over TLS on port 465 by default, and removes the spaces Google shows in App Passwords", () => {
    const config = readMailSettings(GMAIL);

    expect(config).toEqual({
      ok: true,
      via: "smtp",
      settings: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: "zaks.alerts@gmail.com",
        pass: "abcdefghijklmnop",
        from: `"Zak's Sizzling Hub" <zaks.alerts@gmail.com>`,
        to: ["owner@example.com"],
      },
    });
    expect(describeMailConfig(config)).toBe("email alerts on: 1 recipient(s) via smtp.gmail.com:465");
  });

  it("uses another SMTP server as given, with STARTTLS on port 587 and the password unchanged", () => {
    const config = readMailSettings({ ...GMAIL, SMTP_HOST: "smtp.example.com", SMTP_PORT: "587", SMTP_PASS: "pass with spaces" });

    expect(config).toMatchObject({ ok: true, settings: { host: "smtp.example.com", port: 587, secure: false, pass: "pass with spaces" } });
  });

  it("sends to several addresses separated by commas, from ALERT_EMAIL_FROM when set", () => {
    const config = readMailSettings({ ...GMAIL, ALERT_EMAIL_TO: " owner@example.com, manager@example.com ,", ALERT_EMAIL_FROM: "alerts@example.com" });

    expect(config).toMatchObject({ ok: true, settings: { to: ["owner@example.com", "manager@example.com"], from: "alerts@example.com" } });
  });

  it("reports a port or recipient it can't use", () => {
    const config = readMailSettings({ ...GMAIL, SMTP_PORT: "gmail", ALERT_EMAIL_TO: "owner@example.com, not-an-address" });

    expect(config).toEqual({
      ok: false,
      missing: [],
      problems: [
        "SMTP_PORT must be a port number, such as 465 or 587",
        "ALERT_EMAIL_TO has an address that isn't valid: not-an-address",
      ],
    });
  });
});

describe("sending", () => {
  const settings = (readMailSettings(GMAIL) as { settings: MailSettings }).settings;

  it("sends the message from the alert sender to every recipient", async () => {
    // nodemailer's JSON transport builds the message without connecting anywhere.
    const mailer = createMailer({ ...settings, to: ["owner@example.com", "manager@example.com"] }, nodemailer.createTransport({ jsonTransport: true }));

    const info = await mailer.send({ subject: "Low stock", text: "Rice is low." });

    const sent = JSON.parse(info.message!);
    expect(sent).toMatchObject({ subject: "Low stock", text: "Rice is low." });
    expect(sent.from).toEqual({ address: "zaks.alerts@gmail.com", name: "Zak's Sizzling Hub" });
    expect(sent.to).toEqual([{ address: "owner@example.com", name: "" }, { address: "manager@example.com", name: "" }]);
    expect(info.messageId).toBeTruthy();
  });

  describe("to a server that isn't there", () => {
    let server: Server;
    let port: number;

    // Accepts the connection and closes it at once, like a firewall or wrong port would.
    beforeAll(async () => {
      server = createServer((socket) => socket.destroy());
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as { port: number }).port;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it("fails quickly with a message that says to check the server settings", async () => {
      const mailer = createMailer({ ...settings, host: "127.0.0.1", port, secure: false });

      const error = await mailer.send({ subject: "Low stock", text: "Rice is low." }).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(Error);
      expect(describeMailError(error)).toBe("Could not reach the mail server. Check SMTP_HOST and SMTP_PORT, and that this machine is online.");
    });
  });
});

describe("explaining a failed send", () => {
  it("points a refused sign-in at Gmail App Passwords", () => {
    expect(describeMailError(Object.assign(new Error("Invalid login: 535-5.7.8"), { code: "EAUTH" }))).toMatch(/App Password/);
  });

  it("points a refused recipient at ALERT_EMAIL_TO", () => {
    expect(describeMailError(Object.assign(new Error("No recipients defined"), { code: "EENVELOPE" }))).toMatch(/ALERT_EMAIL_TO/);
  });

  it("passes any other error's message through", () => {
    expect(describeMailError(new Error("Something else"))).toBe("Something else");
  });
});

// Resend sends over HTTPS, which Railway allows on every plan (it blocks outgoing SMTP
// below Pro). A fake fetch stands in for Resend, so nothing is sent.
describe("sending through Resend", () => {
  const RESEND = { RESEND_API_KEY: "re_test_key", ALERT_EMAIL_TO: "owner@example.com" };

  type Call = { url: string; init: RequestInit };
  function fakeFetch(status: number, body: object): typeof fetch & { calls: Call[] } {
    const calls: Call[] = [];
    const fn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch & { calls: Call[] };
    fn.calls = calls;
    return fn;
  }
  const settings = { apiKey: "re_test_key", from: RESEND_TEST_SENDER, to: ["owner@example.com"] };

  it("is chosen when RESEND_API_KEY is set, even with SMTP settings too, from Resend's test sender", () => {
    const config = readMailSettings({ ...GMAIL, ...RESEND });

    expect(config).toEqual({ ok: true, via: "resend", settings });
    expect(describeMailConfig(config)).toBe("email alerts on: 1 recipient(s) via Resend");
  });

  it("needs only the recipient besides the key, and uses ALERT_EMAIL_FROM when set", () => {
    expect(readMailSettings({ RESEND_API_KEY: "re_test_key" })).toEqual({ ok: false, missing: ["ALERT_EMAIL_TO"], problems: [] });
    expect(readMailSettings({ ...RESEND, ALERT_EMAIL_FROM: "Zak's <alerts@zaks.ph>" })).toMatchObject({
      ok: true,
      settings: { from: "Zak's <alerts@zaks.ph>" },
    });
  });

  it("posts the message to Resend's API with the key, and returns its id", async () => {
    const fetch = fakeFetch(200, { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" });

    const info = await createResendMailer(settings, fetch).send({ subject: "Low stock", text: "Rice is low.", html: "<p>Rice is low.</p>" });

    expect(info).toEqual({ messageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794", accepted: ["owner@example.com"] });
    expect(fetch.calls).toHaveLength(1);
    const [{ url, init }] = fetch.calls;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      from: RESEND_TEST_SENDER,
      to: ["owner@example.com"],
      subject: "Low stock",
      text: "Rice is low.",
      html: "<p>Rice is low.</p>",
    });
  });

  it("explains Resend's refusal to send to anyone but the account owner before a domain is verified", async () => {
    const fetch = fakeFetch(403, {
      statusCode: 403,
      name: "validation_error",
      message: "You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.",
    });

    const err = await createResendMailer({ ...settings, to: ["manager@example.com"] }, fetch).send({ subject: "x", text: "x" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ResendError);
    expect(describeMailError(err)).toMatch(/^Without a verified domain, Resend only sends to the address the account was created with/);
  });

  it("explains a refused API key, the sending limit, and a network failure", async () => {
    const send = (fetch: typeof globalThis.fetch) => createResendMailer(settings, fetch).send({ subject: "x", text: "x" }).catch((e: unknown) => e);
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    expect(describeMailError(await send(fakeFetch(403, { name: "invalid_api_key", message: "API key is invalid" })))).toMatch(/RESEND_API_KEY/);
    expect(describeMailError(await send(fakeFetch(429, { name: "rate_limit_exceeded", message: "Too many requests" })))).toMatch(/tried again/);
    expect(describeMailError(await send(offline))).toBe("Could not reach Resend. Check that this machine is online.");
  });
});

describe("sending through Brevo", () => {
  const BREVO = { BREVO_API_KEY: "xkeysib-test-key", ALERT_EMAIL_FROM: "zaks.alerts@gmail.com", ALERT_EMAIL_TO: "owner@example.com" };

  type Call = { url: string; init: RequestInit };
  function fakeFetch(status: number, body: object): typeof fetch & { calls: Call[] } {
    const calls: Call[] = [];
    const fn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch & { calls: Call[] };
    fn.calls = calls;
    return fn;
  }
  const settings = { apiKey: "xkeysib-test-key", from: "zaks.alerts@gmail.com", to: ["owner@example.com"] };

  it("is chosen when BREVO_API_KEY is set, even with Resend and SMTP settings too", () => {
    const config = readMailSettings({ ...GMAIL, RESEND_API_KEY: "re_test_key", ...BREVO });

    expect(config).toEqual({ ok: true, via: "brevo", settings });
    expect(describeMailConfig(config)).toBe("email alerts on: 1 recipient(s) via Brevo");
  });

  it("needs a verified sender and a recipient besides the key", () => {
    expect(readMailSettings({ BREVO_API_KEY: "xkeysib-test-key" })).toEqual({
      ok: false,
      missing: ["ALERT_EMAIL_FROM", "ALERT_EMAIL_TO"],
      problems: [],
    });
    expect(readMailSettings({ ...BREVO, ALERT_EMAIL_FROM: "Zak's alerts" })).toMatchObject({
      ok: false,
      problems: [expect.stringMatching(/^ALERT_EMAIL_FROM must be an email address verified in Brevo/)],
    });
  });

  it("posts the message to Brevo's API with the key, the sender's name and address, and returns its id", async () => {
    const fetch = fakeFetch(201, { messageId: "<202610300100.12345@smtp-relay.mailin.fr>" });
    const mailer = createBrevoMailer({ ...settings, from: `"Zak's Alerts" <zaks.alerts@gmail.com>`, to: ["owner@example.com", "manager@example.com"] }, fetch);

    const info = await mailer.send({ subject: "Low stock", text: "Rice is low.", html: "<p>Rice is low.</p>" });

    expect(info).toEqual({ messageId: "<202610300100.12345@smtp-relay.mailin.fr>", accepted: ["owner@example.com", "manager@example.com"] });
    expect(fetch.calls).toHaveLength(1);
    const [{ url, init }] = fetch.calls;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "api-key": "xkeysib-test-key", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: "Zak's Alerts", email: "zaks.alerts@gmail.com" },
      to: [{ email: "owner@example.com" }, { email: "manager@example.com" }],
      subject: "Low stock",
      textContent: "Rice is low.",
      htmlContent: "<p>Rice is low.</p>",
    });
  });

  it("sends as Zak's Sizzling Hub when ALERT_EMAIL_FROM is just an address", async () => {
    const fetch = fakeFetch(201, { messageId: "<1@brevo>" });

    await createBrevoMailer(settings, fetch).send({ subject: "Low stock", text: "Rice is low." });

    expect(JSON.parse(String(fetch.calls[0].init.body)).sender).toEqual({ name: "Zak's Sizzling Hub", email: "zaks.alerts@gmail.com" });
  });

  it("explains a refused key, a blocked IP address, an unverified sender, the sending limit, and a network failure", async () => {
    const send = (fetch: typeof globalThis.fetch) => createBrevoMailer(settings, fetch).send({ subject: "x", text: "x" }).catch((e: unknown) => e);
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const refused = await send(fakeFetch(401, { code: "unauthorized", message: "Key not found" }));
    expect(refused).toBeInstanceOf(BrevoError);
    expect(describeMailError(refused)).toMatch(/BREVO_API_KEY/);
    expect(
      describeMailError(await send(fakeFetch(401, { code: "unauthorized", message: "We have detected you are using an unrecognised IP address 203.0.113.9" })))
    ).toMatch(/Authorised IPs/);
    expect(describeMailError(await send(fakeFetch(400, { code: "invalid_parameter", message: "Sender is not valid" })))).toMatch(/ALERT_EMAIL_FROM/);
    expect(describeMailError(await send(fakeFetch(429, { code: "too_many_requests", message: "Too many requests" })))).toMatch(/tried again/);
    expect(describeMailError(await send(offline))).toBe("Could not reach Brevo. Check that this machine is online.");
  });
});
