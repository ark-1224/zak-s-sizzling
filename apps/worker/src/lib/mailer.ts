import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing email for the worker's alerts, sent one of two ways:
 *
 * - Resend (https://resend.com), over HTTPS, when RESEND_API_KEY is set. Railway's
 *   Trial and Hobby plans block outgoing SMTP, so this is the way the deployed worker
 *   can send. Without a verified domain, Resend only delivers to the address the
 *   account was created with, from its test sender onboarding@resend.dev.
 * - SMTP with nodemailer otherwise. Gmail is the default: set SMTP_USER to the Gmail
 *   address and SMTP_PASS to an App Password for it (Google Account → Security →
 *   2-Step Verification → App passwords), never the normal password. Any other SMTP
 *   server works by also setting SMTP_HOST and SMTP_PORT.
 *
 * Nothing here is required to run the worker: without these settings alerts wait and
 * the worker says so in its log. `npm run mail:test` sends one test email.
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

export interface ResendSettings {
  apiKey: string;
  from: string;
  to: string[];
}

export type MailConfig =
  | { ok: true; via: "smtp"; settings: MailSettings }
  | { ok: true; via: "resend"; settings: ResendSettings }
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
  /** Signs in to the SMTP server without sending anything (nothing to do for Resend). */
  verify(): Promise<void>;
  send(message: MailMessage): Promise<{ messageId: string; accepted: string[]; message?: string }>;
}

const GMAIL_HOST = "smtp.gmail.com";
const EMAIL = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;
const RESEND_URL = "https://api.resend.com/emails";
/** Resend's shared test sender, usable before a domain is verified. */
export const RESEND_TEST_SENDER = "Zak's Sizzling Hub <onboarding@resend.dev>";

/**
 * Reads the email settings from the environment, reporting what's missing or wrong.
 * RESEND_API_KEY, when set, wins over the SMTP settings.
 */
export function readMailSettings(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const value = (name: string) => env[name]?.trim() ?? "";
  const viaResend = Boolean(value("RESEND_API_KEY"));
  const required = viaResend ? ["ALERT_EMAIL_TO"] : ["SMTP_USER", "SMTP_PASS", "ALERT_EMAIL_TO"];
  const missing = required.filter((name) => !value(name));
  const problems: string[] = [];

  const host = value("SMTP_HOST") || GMAIL_HOST;
  const port = value("SMTP_PORT") ? Number(value("SMTP_PORT")) : 465;
  if (!viaResend && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    problems.push(`SMTP_PORT must be a port number, such as 465 or 587`);
  }

  const to = value("ALERT_EMAIL_TO")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  const badAddresses = to.filter((address) => !EMAIL.test(address));
  if (badAddresses.length > 0) problems.push(`ALERT_EMAIL_TO has an address that isn't valid: ${badAddresses.join(", ")}`);

  if (missing.length > 0 || problems.length > 0) return { ok: false, missing, problems };

  if (viaResend) {
    return { ok: true, via: "resend", settings: { apiKey: value("RESEND_API_KEY"), from: value("ALERT_EMAIL_FROM") || RESEND_TEST_SENDER, to } };
  }

  const user = value("SMTP_USER");
  // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop"); the spaces
  // aren't part of the password. Other servers' passwords are used exactly as given.
  const pass = host === GMAIL_HOST ? value("SMTP_PASS").replace(/\s+/g, "") : (env.SMTP_PASS ?? "");
  return {
    ok: true,
    via: "smtp",
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

/** Thrown when Resend answers with an error; `status` is the HTTP status. */
export class ResendError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ResendError";
  }
}

/** Sends through Resend's HTTPS API. `fetchImpl` replaces the network, for tests. */
export function createResendMailer(settings: ResendSettings, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    to: settings.to,
    // Resend has no sign-in step, and a sending-only API key can't read anything else
    // to check itself with, so the test email (npm run mail:test) is the check.
    async verify() {},
    async send(message) {
      let res: Response;
      try {
        res = await fetchImpl(RESEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: settings.from, to: settings.to, subject: message.subject, text: message.text, html: message.html }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        throw Object.assign(new Error(`Could not reach Resend: ${err instanceof Error ? err.message : String(err)}`), {
          code: "ERESENDUNREACHABLE",
        });
      }
      const body = (await res.json().catch(() => ({}))) as { id?: unknown; message?: unknown };
      if (!res.ok) throw new ResendError(res.status, typeof body.message === "string" ? body.message : res.statusText);
      return { messageId: String(body.id ?? ""), accepted: settings.to };
    },
  };
}

/** The mailer for these settings, or null when email isn't set up. */
export function mailerFromConfig(config: MailConfig): Mailer | null {
  if (!config.ok) return null;
  return config.via === "resend" ? createResendMailer(config.settings) : createMailer(config.settings);
}

/** The mailer from the environment's settings, or null when email isn't set up. */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  return mailerFromConfig(readMailSettings(env));
}

/** One line on why email isn't set up, for the worker's log. */
export function describeMailConfig(config: MailConfig): string {
  if (config.ok) {
    if (config.via === "resend") return `email alerts on: ${config.settings.to.length} recipient(s) via Resend`;
    const { host, port, to } = config.settings;
    return `email alerts on: ${to.length} recipient(s) via ${host}:${port}`;
  }
  const parts = [];
  if (config.missing.length > 0) parts.push(`set ${config.missing.join(", ")}`);
  parts.push(...config.problems);
  return `email alerts off (${parts.join("; ")}, or set RESEND_API_KEY and ALERT_EMAIL_TO; see .env.example)`;
}

/** Turns Resend's and nodemailer's errors into something a person setting this up can act on. */
export function describeMailError(err: unknown): string {
  if (err instanceof ResendError) {
    if (/testing emails|own email address|verify a domain/i.test(err.message)) {
      return (
        "Without a verified domain, Resend only sends to the address the account was created with. Set ALERT_EMAIL_TO " +
        "to that address, or verify a domain in Resend (Domains) and set ALERT_EMAIL_FROM to an address on it."
      );
    }
    if (err.status === 401 || /api key/i.test(err.message)) return "Resend refused the API key. Check RESEND_API_KEY (Resend → API Keys).";
    if (err.status === 429) return "Resend's sending limit was reached. The alerts wait and are tried again on the next run.";
    if (err.status === 422) return `Resend refused the email: ${err.message} Check ALERT_EMAIL_FROM and ALERT_EMAIL_TO.`;
    return `Resend refused the email (${err.status}): ${err.message}`;
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "ERESENDUNREACHABLE") return "Could not reach Resend. Check that this machine is online.";
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
