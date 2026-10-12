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
 * header until the window ends. With `countWhen`, only matching responses count:
 * the login limit counts failed sign-ins only, so staff who type their password
 * correctly are never slowed down.
 */
export interface RateLimitOptions {
  windowMs: number;
  /** Read on every request, so a test (or an env var) can change it without a restart. */
  max: () => number;
  /** null skips the limit for this request. */
  key: (req: Request) => string | null;
  /** Count a request only when its response matches (default: every request counts). */
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

export function rateLimit(options: RateLimitOptions): RateLimiter {
  const entries = new Map<string, Entry>();

  // Drop finished windows now and then, so the map can't grow without limit.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
  }, options.windowMs);
  sweep.unref();

  function current(key: string, now: number): Entry {
    const entry = entries.get(key);
    if (entry && entry.resetAt > now) return entry;
    const fresh = { count: 0, resetAt: now + options.windowMs };
    entries.set(key, fresh);
    return fresh;
  }

  const limiter = ((req: Request, res: Response, next: NextFunction) => {
    const key = options.key(req);
    if (key === null) return next();

    const now = Date.now();
    const entry = current(key, now);
    if (entry.count >= options.max()) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return next(new HttpError(429, options.message(retryAfter)));
    }

    if (options.countWhen) {
      res.on("finish", () => {
        if (options.countWhen!(res)) current(key, Date.now()).count++;
      });
    } else {
      entry.count++;
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

const loginEmail = (req: Request) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");
const failedLogin = (res: Response) => res.statusCode === 401;

/** 10 failed sign-ins per email from one address in 15 minutes. */
export const loginAttemptLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envNumber("RATE_LIMIT_LOGIN_FAILURES", 10),
  key: (req) => `${req.ip}|${loginEmail(req)}`,
  countWhen: failedLogin,
  message: (s) => `Too many failed sign-in attempts. Try again in ${waitText(s)}.`,
});

/** 50 failed sign-ins from one address in 15 minutes, whatever the email (guessing many accounts). */
export const loginAddressLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: envNumber("RATE_LIMIT_LOGIN_FAILURES_PER_ADDRESS", 50),
  key: (req) => req.ip ?? null,
  countWhen: failedLogin,
  message: (s) => `Too many failed sign-in attempts from this network. Try again in ${waitText(s)}.`,
});

/**
 * 30 orders a minute per kiosk session (or signed-in user). Keyed by session, not
 * address: every order from the shop's kiosk comes from the same address, and one
 * kiosk session serves many customers.
 */
export const orderPlacementLimit = rateLimit({
  windowMs: 60 * 1000,
  max: envNumber("RATE_LIMIT_ORDERS_PER_MINUTE", 30),
  key: (req) => {
    const signedIn = req as AuthenticatedRequest;
    return signedIn.kioskSessionId ?? signedIn.user?.id ?? req.ip ?? null;
  },
  message: (s) => `Too many orders in a short time. Please wait ${waitText(s)} and try again.`,
});
