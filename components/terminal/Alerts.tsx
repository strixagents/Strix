"use client";

import { useEffect, useState } from "react";
import type { FiredAlert } from "../AlertWatcher";
import { fmtPrice } from "../market-ui";
import { store, useStore, type PriceAlert } from "../store";

/** Price alerts for the token on the chart. Checking/firing is done site-wide by <AlertWatcher />. */
export function Alerts({ pool, symbol, price }: { pool: string | null; symbol: string; price: number | null }) {
  const alerts = useStore<PriceAlert[]>(store.alerts, []);
  const [fired, setFired] = useState<FiredAlert[]>([]);
  const [level, setLevel] = useState("");
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const onFired = (e: Event) => setFired((f) => [...((e as CustomEvent).detail as FiredAlert[]), ...f].slice(0, 10));
    window.addEventListener("strix:alert-fired", onFired);
    return () => window.removeEventListener("strix:alert-fired", onFired);
  }, []);

  const add = () => {
    const p = parseFloat(level.replace(",", "."));
    if (!(p > 0) || price == null || !pool) return;
    store.addAlert({ pool, symbol, price: p, dir: p >= price ? "above" : "below" });
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
        {alerts.length === 0 && <li className="text-xs text-muted">No active alerts. Alerts fire while any Strix tab is open — or ask the agent: “alert me if {symbol || "PONS"} drops 10%”.</li>}
        {alerts.map((a) => (
          <li key={a.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs">
            <span>
              {a.symbol} <span className={a.dir === "above" ? "text-emerald-400" : "text-rose-400"}>{a.dir === "above" ? "≥" : "≤"}</span> ${fmtPrice(a.price)}
            </span>
            <button onClick={() => store.setAlerts(alerts.filter((x) => x.id !== a.id))} className="text-muted hover:text-white" aria-label="Delete alert">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
