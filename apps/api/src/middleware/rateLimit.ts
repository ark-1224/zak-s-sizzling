import type { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "./authenticate";
import { HttpError } from "./errorHandler";

/**
 * A small fixed-window rate limiter, kept in memory. The API runs as a single
 * instance, so a shared store (Redis) isn't needed; restarting the API resets the
 * counts, which only ever errs on the side of letting people back in.
 *
 * Each limiter counts requests per key (an IP and email, a kiosk session...) inside
 * a window. Once a key reaches `max`, further requests get 429 with a Retry-After
 * header until the window ends.
 *
 * A request takes its slot as soon as it arrives, before the route runs, so many
 * requests sent at once can't all slip past the same count. With `countWhen`, the
 * slot is given back afterwards if the response doesn't match: the login limit keeps
 * only failed sign-ins, so staff who type their password correctly are never slowed.
 * The price: requests still in progress hold their slot, so more than `max` sign-ins
 * to one account from one address at the very same moment would be refused, which a
 * real person never does.
 */
export interface RateLimitOptions {
  windowMs: number;
  /** Read on every request, so a test (or an env var) can change it without a restart. */
  max: () => number;
  /** null skips the limit for this request. */
  key: (req: Request) => string | null;
  /** Keep a request's slot only when its response matches (default: every request counts). */
  countWhen?: (res: Response) => boolean;
  message: (retryAfterSeconds: number) => string;
}

interface Entry {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void;
  /** Forget a key, e.g. after a successful login. */
  reset: (req: Request) => void;
}

/** Upper bound on keys held per limiter, so a flood of distinct keys can't exhaust memory. */
const MAX_KEYS = 50_000;

export function rateLimit(options: RateLimitOptions): RateLimiter {
  const entries = new Map<string, Entry>();

  function sweepExpired(now: number) {
    for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
  }

  // Drop finished windows now and then, so the map doesn't keep stale keys.
  const sweep = setInterval(() => sweepExpired(Date.now()), options.windowMs);
  sweep.unref();

  /** The live entry for a key, or undefined. Reading never stores anything. */
  function live(key: string, now: number): Entry | undefined {
    const entry = entries.get(key);
    return entry && entry.resetAt > now ? entry : undefined;
  }

  /** Takes a slot for a key, creating its entry only now that something is counted. */
  function take(key: string, now: number): Entry {
    let entry = live(key, now);
    if (!entry) {
      if (entries.size >= MAX_KEYS) {
        sweepExpired(now);
        // Still full: drop the oldest keys (a Map keeps insertion order).
        for (const oldest of entries.keys()) {
          if (entries.size < MAX_KEYS) break;
          entries.delete(oldest);
        }
      }
      entry = { count: 0, resetAt: now + options.windowMs };
      entries.set(key, entry);
    }
    entry.count++;
    return entry;
  }

  const limiter = ((req: Request, res: Response, next: NextFunction) => {
    const key = options.key(req);
    if (key === null) return next();

    const now = Date.now();
    const existing = live(key, now);
    if (existing && existing.count >= options.max()) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return next(new HttpError(429, options.message(retryAfter)));
    }

    const entry = take(key, now);
    if (options.countWhen) {
      res.on("finish", () => {
        // Give the slot back when the response shouldn't count (e.g. a successful
        // sign-in), unless the window has already moved on.
        if (!options.countWhen!(res) && entries.get(key) === entry && entry.count > 0) entry.count--;
      });
    }
    next();
  }) as RateLimiter;

  limiter.reset = (req: Request) => {
    const key = options.key(req);
    if (key !== null) entries.delete(key);
  };
  return limiter;
}

const envNumber = (name: string, fallback: number) => () => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const minutes = (n: number) => `${n} minute${n !== 1 ? "s" : ""}`;
const waitText = (seconds: number) =>
  seconds <= 60 ? `${seconds} second${seconds !== 1 ? "s" : ""}` : minutes(Math.ceil(seconds / 60));

/** At most 254 characters (the longest valid email), so keys stay small. */
const loginEmail = (req: Request) =>
  typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 254) : "";
const failedLogin = (res: Response) => res.statusCode === 401;
/** Any refused sign-in except a 429 (that attempt never reached the password check). */
const rejectedRequest = (res: Response) => res.statusCode >= 400 && res.statusCode < 500 && res.statusCode !== 429;

/** 10 failed sign-ins per email from one address in 15 minutes. */
export const loginAttemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envNumber("RATE_LIMIT_LOGIN_FAILURES", 10),
  key: (req) => `${req.ip}|${loginEmail(req)}`,
  countWhen: failedLogin,
  message: (s) => `Too many failed sign-in attempts. Try again in ${waitText(s)}.`,
});

/**
 * 50 rejected sign-ins from one address in 15 minutes, whatever the email (guessing
 * many accounts). Counts every rejected attempt, malformed ones included.
 */
export const loginAddressLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envNumber("RATE_LIMIT_LOGIN_FAILURES_PER_ADDRESS", 50),
  key: (req) => req.ip ?? null,
  countWhen: rejectedRequest,
  message: (s) => `Too many failed sign-in attempts from this network. Try again in ${waitText(s)}.`,
});

/**
 * 30 orders a minute per kiosk session (or signed-in user). Keyed by session, not
 * address: every order from the shop's kiosk comes from the same address, and one
 * kiosk session serves many customers.
 */
/** The kiosk session, else the signed-in user, else the address. */
const sessionKey = (req: Request) => {
  const signedIn = req as AuthenticatedRequest;
  return signedIn.kioskSessionId ?? signedIn.user?.id ?? req.ip ?? null;
};

export const orderPlacementLimit = rateLimit({
  windowMs: 60 * 1000,
  max: envNumber("RATE_LIMIT_ORDERS_PER_MINUTE", 30),
  key: sessionKey,
  message: (s) => `Too many orders in a short time. Please wait ${waitText(s)} and try again.`,
});

/**
 * 120 orders a minute from one address, across all sessions: kiosk sessions are free
 * to create, so the per-session limit alone could be dodged with a new session per
 * order. Set high because the shop's kiosk and counter share one address.
 */
export const orderAddressLimit = rateLimit({
  windowMs: 60 * 1000,
  max: envNumber("RATE_LIMIT_ORDERS_PER_MINUTE_PER_ADDRESS", 120),
  key: (req) => req.ip ?? null,
  message: (s) => `Too many orders from this network. Please wait ${waitText(s)} and try again.`,
});

/** 60 new kiosk sessions a minute from one address (a kiosk normally keeps one for hours). */
export const kioskSessionLimit = rateLimit({
  windowMs: 60 * 1000,
  max: envNumber("RATE_LIMIT_KIOSK_SESSIONS_PER_MINUTE", 60),
  key: (req) => req.ip ?? null,
  message: (s) => `Too many new kiosk sessions from this network. Please wait ${waitText(s)} and try again.`,
});

/**
 * Starting an online payment creates a PayMongo checkout session each time, so it is
 * limited too: 10 starts per kiosk session in 10 minutes (a customer who backs out
 * and tries again a few times stays well under it), and 60 per address.
 */
export const paymentStartLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: envNumber("RATE_LIMIT_PAYMENT_STARTS_PER_SESSION", 10),
  key: sessionKey,
  message: (s) => `Too many payment attempts. Please wait ${waitText(s)}, or pay at the counter.`,
});

export const paymentStartAddressLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: envNumber("RATE_LIMIT_PAYMENT_STARTS_PER_ADDRESS", 60),
  key: (req) => req.ip ?? null,
  message: (s) => `Too many payment attempts from this network. Please wait ${waitText(s)}, or pay at the counter.`,
});

/**
 * 60 session renewals a minute from one address. Each signed-in screen renews about
 * every 15 minutes, so even a shop full of staff devices stays far below it.
 */
export const sessionRefreshLimit = rateLimit({
  windowMs: 60 * 1000,
  max: envNumber("RATE_LIMIT_REFRESH_PER_MINUTE", 60),
  key: (req) => req.ip ?? null,
  message: (s) => `Too many sign-in renewals from this network. Please wait ${waitText(s)}.`,
});
