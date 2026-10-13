import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email for the worker's alerts, sent over SMTP with nodemailer. Gmail is the
 * default: set SMTP_USER to the Gmail address and SMTP_PASS to an App Password for it
 * (Google Account → Security → 2-Step Verification → App passwords), never the normal
 * password. Any other SMTP server works by also setting SMTP_HOST and SMTP_PORT.
 *
 * Nothing here is required to run the worker: without these settings alerts stay in the
 * log, as before. `npm run mail:test` sends one test email to check the settings.
 */

export interface MailSettings {
  host: string;
  port: number;
  /** True for port 465 (TLS from the start); other ports upgrade with STARTTLS. */
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string[];
}

export type MailConfig =
  | { ok: true; settings: MailSettings }
  /** `missing` lists unset variables; `problems` describes ones set to something unusable. */
  | { ok: false; missing: string[]; problems: string[] };

export interface MailMessage {
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  /** Who the alerts go to. */
  to: string[];
  /** Signs in to the SMTP server without sending anything. */
  verify(): Promise<void>;
  send(message: MailMessage): Promise<{ messageId: string; accepted: string[]; message?: string }>;
}

const GMAIL_HOST = "smtp.gmail.com";
const EMAIL = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

/** Reads the SMTP settings from the environment, reporting what's missing or wrong. */
export function readMailSettings(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const value = (name: string) => env[name]?.trim() ?? "";
  const missing = ["SMTP_USER", "SMTP_PASS", "ALERT_EMAIL_TO"].filter((name) => !value(name));
  const problems: string[] = [];

  const host = value("SMTP_HOST") || GMAIL_HOST;
  const port = value("SMTP_PORT") ? Number(value("SMTP_PORT")) : 465;
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push(`SMTP_PORT must be a port number, such as 465 or 587`);

  const to = value("ALERT_EMAIL_TO")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const badAddresses = to.filter((address) => !EMAIL.test(address));
  if (badAddresses.length > 0) problems.push(`ALERT_EMAIL_TO has an address that isn't valid: ${badAddresses.join(", ")}`);

  if (missing.length > 0 || problems.length > 0) return { ok: false, missing, problems };

  const user = value("SMTP_USER");
  // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop"); the spaces
  // aren't part of the password. Other servers' passwords are used exactly as given.
  const pass = host === GMAIL_HOST ? value("SMTP_PASS").replace(/\s+/g, "") : (env.SMTP_PASS ?? "");
  return {
    ok: true,
    settings: {
      host,
      port,
      secure: port === 465,
      user,
      pass,
      from: value("ALERT_EMAIL_FROM") || `"Zak's Sizzling Hub" <${user}>`,
      to,
    },
  };
}

/** `transport` replaces the SMTP connection, for tests. */
export function createMailer(settings: MailSettings, transport?: Transporter): Mailer {
  const transporter =
    transport ??
    nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.user, pass: settings.pass },
      // An hourly job must not hang on an unreachable server.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

  return {
    to: settings.to,
    async verify() {
      await transporter.verify();
    },
    async send(message) {
      const info = await transporter.sendMail({ from: settings.from, to: settings.to, ...message });
      return {
        messageId: info.messageId,
        accepted: (info.accepted ?? []).map(String),
        // Only the JSON transport used in tests returns the message itself.
        message: typeof info.message === "string" ? info.message : undefined,
      };
    },
  };
}

/** The mailer from the environment's settings, or null when email isn't set up. */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  const config = readMailSettings(env);
  return config.ok ? createMailer(config.settings) : null;
}

/** One line on why email isn't set up, for the worker's log. */
export function describeMailConfig(config: MailConfig): string {
  if (config.ok) {
    const { host, port, to } = config.settings;
    return `email alerts on: ${to.length} recipient(s) via ${host}:${port}`;
  }
  const parts = [];
  if (config.missing.length > 0) parts.push(`set ${config.missing.join(", ")}`);
  parts.push(...config.problems);
  return `email alerts off (${parts.join("; ")}; see .env.example)`;
}

/** Turns nodemailer's errors into something a person setting this up can act on. */
export function describeMailError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case "EAUTH":
      return (
        "The mail server refused the sign-in. For Gmail, SMTP_USER must be the full Gmail address and SMTP_PASS an " +
        "App Password (Google Account → Security → 2-Step Verification → App passwords), not the normal password."
      );
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ESOCKET":
    case "EDNS":
    case "ECONNREFUSED":
      return "Could not reach the mail server. Check SMTP_HOST and SMTP_PORT, and that this machine is online.";
    case "EENVELOPE":
      return "The mail server refused the recipient address. Check ALERT_EMAIL_TO.";
    default:
      return err instanceof Error ? err.message : String(err);
  }
}
