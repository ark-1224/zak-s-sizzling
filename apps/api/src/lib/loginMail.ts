/**
 * Emails for staff and admin sign-in: the sign-in code, and the test email an admin
 * sends from the Users page to check an address before relying on it.
 *
 * Sent through Brevo's HTTPS API (https://brevo.com), because Railway's Hobby plan blocks
 * outgoing SMTP. Set BREVO_API_KEY (Brevo → SMTP & API → API keys) and LOGIN_CODE_FROM,
 * a sender address verified in Brevo (Senders). Brevo API keys can't be limited to
 * sending, so use a Brevo account kept only for this.
 *
 * Without BREVO_API_KEY outside production (a laptop), the email isn't sent: it's
 * printed in the API's log instead, so sign-in still works while developing.
 */

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER_NAME = "Zak's Sizzling Hub";
const TIMEOUT_MS = 15_000;

export interface LoginEmail {
  to: { email: string; name: string };
  subject: string;
  text: string;
  html: string;
}

/** Thrown when an email can't be sent; `message` says what to fix, for the API log and admins. */
export class LoginMailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginMailError";
  }
}

const value = (name: string) => process.env[name]?.trim() ?? "";

/** Whether sign-in codes are required. On unless LOGIN_CODES is "off" (the emergency switch). */
export function loginCodesEnabled(): boolean {
  return value("LOGIN_CODES").toLowerCase() !== "off";
}

/** Why Brevo refused, in words someone setting it up can act on. */
export function describeBrevoError(status: number, message: string): string {
  // Checked before the 401 below: Brevo answers 401 for an unknown IP address too.
  if (/\bIP\b/i.test(message) && /(unrecogni[sz]ed|authori[sz]ed|blocked)/i.test(message)) {
    return "Brevo blocked the API's IP address. Turn off IP blocking in Brevo (Security → Authorised IPs).";
  }
  if (status === 401) return "Brevo refused the API key. Check BREVO_API_KEY (Brevo → SMTP & API → API keys).";
  if (/sender/i.test(message)) {
    return "Brevo refused the sender. LOGIN_CODE_FROM must be a sender verified in Brevo (Senders, domains & IPs).";
  }
  if (status === 429) return "Brevo's sending limit was reached. Try again later.";
  return `Brevo refused the email (${status}): ${message}`;
}

/** Sends one email ("sent"), or prints it in the log when Brevo isn't set up outside production ("logged"). */
export async function sendLoginEmail(email: LoginEmail): Promise<"sent" | "logged"> {
  const apiKey = value("BREVO_API_KEY");
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new LoginMailError("Sign-in emails aren't set up: set BREVO_API_KEY and LOGIN_CODE_FROM.");
    }
    console.log(`[sign-in email, not sent: BREVO_API_KEY isn't set] to ${email.to.email}: ${email.subject}`);
    return "logged";
  }
  const from = value("LOGIN_CODE_FROM");
  if (!from) throw new LoginMailError("Set LOGIN_CODE_FROM to the sender address verified in Brevo.");

  let res: Response;
  try {
    res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: from },
        to: [email.to],
        subject: email.subject,
        textContent: email.text,
        htmlContent: email.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new LoginMailError(`Could not reach Brevo: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown };
    throw new LoginMailError(describeBrevoError(res.status, typeof body.message === "string" ? body.message : res.statusText));
  }
  return "sent";
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(name: string, lines: string[]): string {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#2b2420;max-width:480px">`,
    `<p>Hi ${escapeHtml(name)},</p>`,
    ...lines,
    `<p style="color:#7a6e66;font-size:13px">Zak's Sizzling Hub back office</p>`,
    `</div>`,
  ].join("");
}

/** The email with a sign-in code. */
export function loginCodeEmail(to: { email: string; name: string }, code: string, minutes: number): LoginEmail {
  return {
    to,
    subject: `${code} is your Zak's Sizzling Hub sign-in code`,
    text:
      `Hi ${to.name},\n\nYour sign-in code is ${code}. It works for ${minutes} minutes.\n\n` +
      `If you didn't just sign in, someone else has your password: change it, or ask an admin to.\n\n` +
      `Zak's Sizzling Hub back office`,
    html: page(to.name, [
      `<p>Your sign-in code is:</p>`,
      `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:8px 0">${code}</p>`,
      `<p>It works for ${minutes} minutes.</p>`,
      `<p>If you didn't just sign in, someone else has your password: change it, or ask an admin to.</p>`,
    ]),
  };
}

/** The test email an admin sends from the Users page. */
export function testEmail(to: { email: string; name: string }): LoginEmail {
  return {
    to,
    subject: "Test email from Zak's Sizzling Hub",
    text:
      `Hi ${to.name},\n\nThis address receives your Zak's Sizzling Hub sign-in codes, and this test shows it works. ` +
      `Nothing else to do.\n\nZak's Sizzling Hub back office`,
    html: page(to.name, [
      `<p>This address receives your Zak's Sizzling Hub sign-in codes, and this test shows it works. Nothing else to do.</p>`,
    ]),
  };
}
