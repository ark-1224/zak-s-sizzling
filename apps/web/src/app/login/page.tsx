"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 py-8">
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
            className="min-h-11 w-full rounded-lg border border-line px-3 text-base outline-none focus:border-matcha"
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
            className="min-h-11 w-full rounded-lg border border-line px-3 text-base outline-none focus:border-matcha"
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
    </div>
  );
}
