"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LoginCodeChallenge } from "@zaks/shared-types";
import { login, LoginStartOverError, pageAfterLogin, resendLoginCode, verifyLoginCode } from "@/lib/auth";

// Two steps when sign-in codes are on (the API's default): the password, then the
// 6-digit code emailed to the account (apps/api/src/modules/auth/loginCodes.ts).
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<LoginCodeChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function signedIn() {
    // Back to the page that sent the user here (?next=), otherwise the dashboard.
    router.push(pageAfterLogin(new URLSearchParams(window.location.search).get("next")));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if ("codeRequired" in result) {
        setChallenge(result);
        setPassword("");
      } else {
        signedIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  function startOver(message: string | null) {
    setChallenge(null);
    setError(message);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 py-8">
      {challenge ? (
        <CodeStep challenge={challenge} onSignedIn={signedIn} onStartOver={startOver} />
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card bg-white p-6 shadow-card sm:p-8">
          <h1 className="font-display mb-1 text-2xl font-semibold text-matcha-deep">Staff &amp; Admin Login</h1>
          <p className="mb-6 text-base text-ink-soft">Zak&apos;s Sizzling Hub back office</p>

          <label className="mb-3 block text-base">
            <span className="mb-1 block font-medium text-ink">Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-line px-3 text-base focus:border-matcha"
            />
          </label>

          <label className="mb-5 block text-base">
            <span className="mb-1 block font-medium text-ink">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-line px-3 text-base focus:border-matcha"
            />
          </label>

          {error && <p className="mb-4 text-base text-berry">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-matcha py-3 font-bold text-cream shadow-card disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}

function CodeStep({
  challenge: first,
  onSignedIn,
  onStartOver,
}: {
  challenge: LoginCodeChallenge;
  onSignedIn: () => void;
  onStartOver: (message: string | null) => void;
}) {
  const [challenge, setChallenge] = useState(first);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + first.resendInSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  /** The last code checked automatically, so a wrong one isn't sent again. */
  const autoSent = useRef<string | null>(null);

  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (waitSeconds === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitSeconds]);

  async function verify(value: string) {
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await verifyLoginCode(challenge.challengeId, value);
      onSignedIn();
    } catch (err) {
      if (err instanceof LoginStartOverError) return onStartOver(err.message);
      setError(err instanceof Error ? err.message : "Could not check the code");
      setCode("");
      input.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  // A code typed in full or pasted from the email is checked straight away.
  function handleChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && autoSent.current !== digits && !submitting) {
      autoSent.current = digits;
      verify(digits);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      const next = await resendLoginCode(challenge.challengeId);
      setChallenge(next);
      setResendAt(Date.now() + next.resendInSeconds * 1000);
      setNow(Date.now());
      setCode("");
      autoSent.current = null;
      setNotice(`A new code is on its way to ${next.sentTo}. Use the newest email.`);
      input.current?.focus();
    } catch (err) {
      if (err instanceof LoginStartOverError) return onStartOver(err.message);
      setError(err instanceof Error ? err.message : "Could not send a new code");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) verify(code);
      }}
      className="w-full max-w-sm rounded-card bg-white p-6 shadow-card sm:p-8"
    >
      <h1 className="font-display mb-1 text-2xl font-semibold text-matcha-deep">Check your email</h1>
      <p className="mb-6 text-base text-ink-soft">
        We sent a 6-digit code to <span className="font-semibold text-ink">{challenge.sentTo}</span>. It works for{" "}
        {Math.round(challenge.expiresInSeconds / 60)} minutes.
      </p>

      <label className="mb-5 block text-base">
        <span className="mb-1 block font-medium text-ink">Sign-in code</span>
        <input
          ref={input}
          autoFocus
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          aria-describedby="code-help"
          className="min-h-14 w-full rounded-lg border border-line px-3 text-center font-mono text-3xl tracking-[0.4em] focus:border-matcha"
        />
        <span id="code-help" className="mt-1 block text-sm text-ink-soft">
          Not there? Check the spam folder.
        </span>
      </label>

      {error && (
        <p role="alert" className="mb-4 text-base text-berry">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-base text-matcha-deep">
          {notice}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full rounded-full bg-matcha py-3 font-bold text-cream shadow-card disabled:opacity-60"
      >
        {submitting ? "Checking…" : "Sign in"}
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-base">
        <button
          type="button"
          onClick={resend}
          disabled={waitSeconds > 0 || submitting}
          className="min-h-11 font-semibold text-matcha-deep underline-offset-4 hover:underline disabled:font-normal disabled:text-ink-soft disabled:no-underline"
        >
          {waitSeconds > 0 ? `Send a new code in ${waitSeconds}s` : "Send a new code"}
        </button>
        <button type="button" onClick={() => onStartOver(null)} className="min-h-11 text-ink-soft underline-offset-4 hover:underline">
          Use a different account
        </button>
      </div>
    </form>
  );
}
