"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPrice } from "../market-ui";

type Alert = { id: string; pool: string; symbol: string; price: number; dir: "above" | "below"; created: number };
type Fired = Alert & { hit: number; at: number };
const KEY = "strix.rh.alerts";

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

export function Alerts({ pool, symbol, price }: { pool: string | null; symbol: string; price: number | null }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [fired, setFired] = useState<Fired[]>([]);
  const [level, setLevel] = useState("");
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const ref = useRef(alerts);
  ref.current = alerts;

  useEffect(() => {
    try {
      setAlerts(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch {}
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const persist = (next: Alert[]) => {
    setAlerts(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  useEffect(() => {
    const check = async () => {
      const list = ref.current;
      if (!list.length) return;
      const pools = [...new Set(list.map((a) => a.pool.toLowerCase()))];
      try {
        const prices: Record<string, number | null> = await fetch(`/api/price?pools=${pools.join(",")}`).then((r) => r.json());
        const hits = list.filter((a) => {
          const p = prices[a.pool.toLowerCase()];
          return p != null && (a.dir === "above" ? p >= a.price : p <= a.price);
        });
        if (!hits.length) return;
        persist(list.filter((a) => !hits.includes(a)));
        setFired((f) => [...hits.map((h) => ({ ...h, hit: prices[h.pool.toLowerCase()]!, at: Date.now() })), ...f].slice(0, 10));
        beep();
        hits.forEach((h) => {
          if (typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification("Strix price alert", { body: `${h.symbol} is ${h.dir} $${fmtPrice(h.price)} (now $${fmtPrice(prices[h.pool.toLowerCase()]!)})` });
        });
      } catch {}
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  const add = () => {
    const p = parseFloat(level.replace(",", "."));
    if (!(p > 0) || price == null || !pool) return;
    persist([...alerts, { id: crypto.randomUUID(), pool, symbol, price: p, dir: p >= price ? "above" : "below", created: Date.now() }]);
    setLevel("");
    if (perm === "default" && typeof Notification !== "undefined") Notification.requestPermission().then(setPerm);
  };

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-muted">Price alerts</div>
        {perm !== "granted" && perm !== "unsupported" && (
          <button onClick={() => Notification.requestPermission().then(setPerm)} className="text-[11px] text-amber hover:underline">
            Enable notifications
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <div className="flex flex-1 items-center rounded-lg border border-line bg-ink/60 px-2.5 focus-within:border-white/30">
          <span className="font-mono text-xs text-muted">{symbol || "…"} $</span>
          <input
            inputMode="decimal"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            placeholder={price ? fmtPrice(price) : "price"}
            className="w-full bg-transparent px-2 py-1.5 font-mono text-sm outline-none placeholder:text-zinc-600"
          />
        </div>
        <button className="rounded-lg bg-white px-3 text-sm font-medium text-ink hover:bg-zinc-200">+ Alert</button>
      </form>

      {fired.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {fired.map((f) => (
            <li key={f.id} className="flex items-center justify-between rounded-lg border border-amber/40 bg-amber/10 px-2.5 py-1.5 text-xs">
              <span>🔔 <b>{f.symbol}</b> hit {f.dir} ${fmtPrice(f.price)} → ${fmtPrice(f.hit)}</span>
              <button onClick={() => setFired((x) => x.filter((y) => y.id !== f.id))} className="text-muted hover:text-white">✕</button>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-3 space-y-1">
        {alerts.length === 0 && <li className="text-xs text-muted">No active alerts. Alerts fire while this tab is open.</li>}
        {alerts.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs">
            <span>
              {a.symbol} <span className={a.dir === "above" ? "text-emerald-400" : "text-rose-400"}>{a.dir === "above" ? "≥" : "≤"}</span> ${fmtPrice(a.price)}
            </span>
            <button onClick={() => persist(alerts.filter((x) => x.id !== a.id))} className="text-muted hover:text-white" aria-label="Delete alert">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
