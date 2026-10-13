import { createServer, type Server } from "node:net";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The worker's email sender (Low-stock notifications 1/3), tested here like the worker's
// low-stock job is: from the api's test projects, since the worker has none of its own.
import {
  createMailer,
  describeMailConfig,
  describeMailError,
  mailerFromEnv,
  readMailSettings,
  type MailSettings,
} from "../../../worker/src/lib/mailer";

const GMAIL = { SMTP_USER: "zaks.alerts@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop", ALERT_EMAIL_TO: "owner@example.com" };

describe("reading the email settings", () => {
  it("is off, naming each missing setting, when nothing is set", () => {
    const config = readMailSettings({});

    expect(config).toEqual({ ok: false, missing: ["SMTP_USER", "SMTP_PASS", "ALERT_EMAIL_TO"], problems: [] });
    expect(describeMailConfig(config)).toBe(
      "email alerts off (set SMTP_USER, SMTP_PASS, ALERT_EMAIL_TO; see .env.example)"
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
