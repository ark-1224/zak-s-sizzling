"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { getSocket } from "@/lib/websocket";
import type { OrderBoardDTO } from "@zaks/shared-types";

// The order status board on the screen at the counter: the customer's ready notice.
// Paid orders show under Preparing while the kitchen works on them, then move to Ready
// for pickup when every dish is done, with a chime; they leave once the kitchen presses
// Handed over. No sign-in (GET /api/orders/board returns order numbers only), and it
// updates live (orders:changed), with a slow re-check in case the connection drops.
const RECHECK_MS = 60_000;
const HIGHLIGHT_MS = 15_000;

/** A short two-note chime, made in the browser so the page needs no sound file. */
function playChime(ctx: AudioContext) {
  const start = ctx.currentTime;
  [880, 1320].forEach((frequency, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + i * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.3, start + i * 0.25 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.25 + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + i * 0.25);
    osc.stop(start + i * 0.25 + 0.65);
  });
}

export default function OrderBoardPage() {
  const [board, setBoard] = useState<OrderBoardDTO | null>(null);
  const [offline, setOffline] = useState(false);
  // Order numbers that just became ready, and when, so they stand out for a moment.
  const [justReady, setJustReady] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const knownReady = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiFetch<OrderBoardDTO>("/api/orders/board");
      const known = knownReady.current;
      const fresh = known ? next.ready.filter((n) => !known.has(n)) : [];
      knownReady.current = new Set(next.ready);
      if (fresh.length > 0) {
        const at = Date.now();
        setJustReady((current) => ({ ...current, ...Object.fromEntries(fresh.map((n) => [n, at])) }));
        if (audio.current?.state === "running") playChime(audio.current);
      }
      setBoard(next);
      setOffline(false);
    } catch {
      setOffline(true); // keep showing the last board
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const recheck = setInterval(load, RECHECK_MS);
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(recheck);
      clearInterval(tick);
    };
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("orders:changed", load);
    socket.on("connect", load); // catch up after a dropped connection
    return () => {
      socket.off("orders:changed", load);
      socket.off("connect", load);
    };
  }, [load]);

  // Browsers only allow sound after someone taps the page once (a kiosk browser can be
  // started with --autoplay-policy=no-user-gesture-required to skip this).
  async function turnSoundOn() {
    audio.current ??= new AudioContext();
    await audio.current.resume();
    setSoundOn(audio.current.state === "running");
    if (audio.current.state === "running") playChime(audio.current);
  }

  useEffect(() => {
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      // Already allowed (kiosk browser flag): no button needed.
      Promise.resolve().then(() => setSoundOn(ctx.state === "running"));
      ctx.onstatechange = () => setSoundOn(ctx.state === "running");
    } catch {
      // No Web Audio: the board simply stays silent.
    }
    return () => {
      audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-char text-cream">
      <header className="flex shrink-0 items-center gap-4 border-b-2 border-honey/50 px-6 py-4 lg:px-10">
        <h1 className="font-display text-3xl font-extrabold lg:text-4xl 2xl:text-6xl">Order status</h1>
        <span className="text-lg text-cream/70 2xl:text-2xl">Zak&apos;s Sizzling Hub</span>
        <div className="ml-auto flex items-center gap-3">
          {offline && <span className="rounded-full bg-berry px-3 py-1 text-sm font-bold">Reconnecting…</span>}
          {!soundOn && (
            <button onClick={turnSoundOn} className="min-h-11 rounded-full border-2 border-honey px-4 text-sm font-bold text-honey">
              Tap to turn on sound
            </button>
          )}
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-[2fr_3fr] lg:gap-10 lg:p-10">
        <section aria-labelledby="preparing-heading" className="flex flex-col">
          <h2 id="preparing-heading" className="font-display mb-4 text-2xl font-bold text-honey-soft lg:text-3xl 2xl:text-5xl">
            Preparing
          </h2>
          {board && board.preparing.length === 0 ? (
            <p className="text-xl text-cream/60 2xl:text-3xl">No orders being prepared.</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] content-start gap-3 2xl:grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] 2xl:gap-5">
              {board?.preparing.map((number) => (
                <li key={number} className="rounded-soft bg-char-soft px-4 py-3 text-center font-display text-2xl font-bold whitespace-nowrap xl:text-3xl 2xl:text-5xl 2xl:py-5">
                  {number}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ready-heading" aria-live="polite" className="flex flex-col rounded-card bg-cream p-5 text-ink lg:p-8">
          <h2 id="ready-heading" className="font-display mb-1 text-3xl font-extrabold text-matcha-deep lg:text-4xl 2xl:text-6xl">
            Ready for pickup
          </h2>
          <p className="mb-5 text-lg text-ink-soft 2xl:mb-8 2xl:text-3xl">Please collect your order at the counter.</p>
          {board && board.ready.length === 0 ? (
            <p className="text-xl text-ink-soft 2xl:text-3xl">Nothing waiting right now.</p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start gap-4 2xl:grid-cols-[repeat(auto-fill,minmax(24rem,1fr))] 2xl:gap-6">
              {board?.ready.map((number) => {
                const fresh = justReady[number] !== undefined && now - justReady[number] < HIGHLIGHT_MS;
                return (
                  <li
                    key={number}
                    className={`rounded-soft px-4 py-5 text-center font-display text-4xl font-extrabold whitespace-nowrap xl:text-5xl 2xl:py-8 2xl:text-7xl ${
                      fresh ? "animate-pulse bg-matcha text-cream motion-reduce:animate-none" : "bg-white text-ink shadow-card"
                    }`}
                  >
                    {number}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
