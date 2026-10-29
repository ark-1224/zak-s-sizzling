import bcrypt from "bcrypt";
import { randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { LoginMailError, loginCodeEmail, sendLoginEmail } from "../../lib/loginMail";
import { HttpError } from "../../middleware/errorHandler";

/**
 * The second step of staff and admin sign-in: after a correct password, a 6-digit code
 * is emailed to the account's address, and only that code starts the session.
 *
 * - A code works for 10 minutes and allows 5 wrong tries; after that the person starts
 *   again from the password.
 * - "Send a new code" waits 60 seconds between emails, at most 3 times per sign-in, and
 *   an account gets at most 10 emails an hour (so nobody can flood an inbox, and the
 *   Brevo free plan's daily limit is safe).
 * - Only a bcrypt hash of the code is stored, and a code works once.
 */
export const CODE_MINUTES = 10;
export const MAX_WRONG_CODES = 5;
export const RESEND_WAIT_SECONDS = 60;
export const MAX_SENDS = 4; // the first email plus 3 resends
export const MAX_SENDS_PER_HOUR = 10;

/** A 6-digit code, from a cryptographic random source. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** "maria.santos@gmail.com" → "ma•••@gmail.com", to say where the code went without showing the whole address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length - 1))}•••${email.slice(at)}`;
}

export interface CodeChallenge {
  codeRequired: true;
  challengeId: string;
  sentTo: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}

/** Emails a code; on failure, logs why and tells the person to try again. */
async function emailCode(user: { email: string; name: string }, code: string) {
  try {
    await sendLoginEmail(loginCodeEmail({ email: user.email, name: user.name }, code, CODE_MINUTES));
  } catch (err) {
    console.error(`Sign-in code for ${user.email} not sent: ${err instanceof LoginMailError ? err.message : String(err)}`);
    throw new HttpError(503, "We couldn't send your sign-in code. Try again in a minute, or ask an admin for help.");
  }
}

async function sendsInLastHour(userId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 60 * 60 * 1000);
  const { _sum } = await prisma.loginCode.aggregate({ where: { userId, sentAt: { gte: since } }, _sum: { sends: true } });
  return _sum.sends ?? 0;
}

const tooManyThisHour = () =>
  new HttpError(429, "Too many sign-in codes were sent to this account in the last hour. Try again later.");

/** Called after a correct password: emails a code and returns what the sign-in page needs. */
export async function startCodeChallenge(user: { id: string; email: string; name: string }): Promise<CodeChallenge> {
  const now = new Date();
  if ((await sendsInLastHour(user.id, now)) >= MAX_SENDS_PER_HOUR) throw tooManyThisHour();

  // Only the newest code for an account works, and day-old rows aren't needed any more.
  await prisma.loginCode.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  await prisma.loginCode.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });

  const code = generateCode();
  const challenge = await prisma.loginCode.create({
    data: {
      userId: user.id,
      codeHash: await bcrypt.hash(code, 10),
      sentAt: now,
      expiresAt: new Date(now.getTime() + CODE_MINUTES * 60 * 1000),
    },
  });
  try {
    await emailCode(user, code);
  } catch (err) {
    // Nothing was sent, so this attempt doesn't count towards the hourly limit.
    await prisma.loginCode.delete({ where: { id: challenge.id } });
    throw err;
  }
  return {
    codeRequired: true,
    challengeId: challenge.id,
    sentTo: maskEmail(user.email),
    expiresInSeconds: CODE_MINUTES * 60,
    resendInSeconds: RESEND_WAIT_SECONDS,
  };
}

/** 410: this sign-in can't continue, so the page goes back to the password. */
const startOver = (why: string) => new HttpError(410, `${why} Sign in again to get a new code.`);

/** A pending challenge, or the reason it can no longer be used. */
async function pendingChallenge(challengeId: string, now: Date) {
  const challenge = await prisma.loginCode.findUnique({ where: { id: challengeId }, include: { user: { include: { role: true } } } });
  if (!challenge || challenge.usedAt) throw startOver("This sign-in has ended.");
  if (challenge.expiresAt <= now) throw startOver("The code has expired.");
  if (challenge.attempts >= MAX_WRONG_CODES) throw startOver("Too many wrong codes.");
  if (!challenge.user.isActive) throw startOver("This sign-in has ended.");
  return challenge;
}

/** Checks a code; returns the account to sign in when it's right. */
export async function verifyCode(challengeId: string, code: string) {
  const now = new Date();
  const challenge = await pendingChallenge(challengeId, now);

  // Take a try before comparing, in one statement, so codes sent at the same moment
  // can't get more than MAX_WRONG_CODES tries between them.
  const took = await prisma.loginCode.updateMany({
    where: { id: challenge.id, usedAt: null, attempts: { lt: MAX_WRONG_CODES } },
    data: { attempts: { increment: 1 } },
  });
  if (took.count === 0) throw startOver("Too many wrong codes.");

  if (!(await bcrypt.compare(code, challenge.codeHash))) {
    const left = MAX_WRONG_CODES - (challenge.attempts + 1);
    if (left <= 0) throw startOver("Too many wrong codes.");
    throw new HttpError(401, `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }

  // A code works once, even if the same right code arrives twice at the same moment.
  const used = await prisma.loginCode.updateMany({ where: { id: challenge.id, usedAt: null }, data: { usedAt: now } });
  if (used.count === 0) throw startOver("This sign-in has ended.");
  return challenge.user;
}

/** Emails a new code for the same sign-in. The tries already used still count. */
export async function resendCode(challengeId: string): Promise<CodeChallenge> {
  const now = new Date();
  const challenge = await pendingChallenge(challengeId, now);

  const waited = (now.getTime() - challenge.sentAt.getTime()) / 1000;
  if (waited < RESEND_WAIT_SECONDS) {
    const wait = Math.ceil(RESEND_WAIT_SECONDS - waited);
    throw new HttpError(429, `Wait ${wait} second${wait === 1 ? "" : "s"} before asking for a new code.`);
  }
  if (challenge.sends >= MAX_SENDS) throw startOver("That's the most codes for one sign-in.");
  if ((await sendsInLastHour(challenge.userId, now)) >= MAX_SENDS_PER_HOUR) throw tooManyThisHour();

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + CODE_MINUTES * 60 * 1000);
  // Claim the resend first (it fails if another resend just happened), then send.
  const claimed = await prisma.loginCode.updateMany({
    where: { id: challenge.id, usedAt: null, sends: challenge.sends },
    data: { codeHash: await bcrypt.hash(code, 10), sends: { increment: 1 }, sentAt: now, expiresAt },
  });
  if (claimed.count === 0) throw new HttpError(429, `Wait ${RESEND_WAIT_SECONDS} seconds before asking for a new code.`);

  await emailCode(challenge.user, code);
  return {
    codeRequired: true,
    challengeId: challenge.id,
    sentTo: maskEmail(challenge.user.email),
    expiresInSeconds: CODE_MINUTES * 60,
    resendInSeconds: RESEND_WAIT_SECONDS,
  };
}
