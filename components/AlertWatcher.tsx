"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPrice } from "./market-ui";
import { store, type PriceAlert } from "./store";

export type FiredAlert = PriceAlert & { hit: number; at: number };

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
  } catch {}
}

/**
 * One alert checker for the whole site (mounted in the root layout): every 60s it reads live prices
 * for the pools with active alerts, fires the ones that crossed (sound + notification + toast) and
 * removes them. Views listen to `strix:alert-fired` to show history.
 */
export function AlertWatcher() {
  const [toasts, setToasts] = useState<FiredAlert[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    const check = async () => {
      const list = store.alerts();
      if (!list.length || busy.current) return;
      busy.current = true;
      try {
        const pools = [...new Set(list.map((a) => a.pool.toLowerCase()))];
        const prices: Record<string, number | null> = await fetch(`/api/price?pools=${pools.join(",")}`).then((r) => r.json());
        // re-read: another tab or the agent may have changed alerts while we were fetching
        const now = store.alerts();
        const hits = now.filter((a) => {
          const p = prices[a.pool.toLowerCase()];
          return p != null && (a.dir === "above" ? p >= a.price : p <= a.price);
        });
        if (!hits.length) return;
        store.setAlerts(now.filter((a) => !hits.includes(a)));
        const fired = hits.map((h) => ({ ...h, hit: prices[h.pool.toLowerCase()]!, at: Date.now() }));
        window.dispatchEvent(new CustomEvent("strix:alert-fired", { detail: fired }));
        setToasts((t) => [...fired, ...t].slice(0, 4));
        beep();
        for (const h of fired)
          if (typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification("Strix price alert", { body: `${h.symbol} is ${h.dir} $${fmtPrice(h.price)} (now $${fmtPrice(h.hit)})` });
      } catch {
      } finally {
        busy.current = false;
      }
    };
    check();
    const id = setInterval(check, 60_000);
    const onChange = (e: Event) => (e as CustomEvent).detail === "alerts" && check();
    window.addEventListener("strix:store", onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("strix:store", onChange);
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,340px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="animate-fade-up rounded-xl border border-amber/40 bg-[#14110a]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-amber">🔔 {t.symbol} alert</div>
              <div className="mt-0.5 text-zinc-300">
                Price is {t.dir} ${fmtPrice(t.price)} — now ${fmtPrice(t.hit)}
              </div>
            </div>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-muted hover:text-white" aria-label="Dismiss">✕</button>
          </div>
          <a href={`/app?pool=${t.pool}`} className="mt-1.5 inline-block text-xs text-zinc-400 hover:text-white">Open in analyst →</a>
        </div>
      ))}
    </div>
  );
}
