"use client";

import { useEffect, useState } from "react";
import { store, useStore, type WatchItem } from "./store";
import { PriceChart, type Candle } from "./terminal/PriceChart";
import { Alerts } from "./terminal/Alerts";

type Level = { price: number; touches: number };
type Data = { candles: Candle[]; candlesPending?: boolean; analysis: { support: Level[]; resistance: Level[] } | null; token?: { price: number } };
const IVS = ["15m", "1h", "4h", "1d"] as const;

/** ⭐ Watch toggle: adds the token to the browser watchlist shown on /me, in the agent and in push alerts. */
export function WatchButton({ pool, symbol }: { pool: string; symbol: string }) {
  const watch = useStore<WatchItem[]>(store.watch, []);
  const on = watch.some((w) => w.pool.toLowerCase() === pool.toLowerCase());
  return (
    <button
      type="button"
      onClick={() => (on ? store.removeWatch(pool) : store.addWatch({ pool, symbol }))}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition ${on ? "border-amber/40 bg-amber/10 text-amber" : "border-line text-zinc-300 hover:text-white"}`}
    >
      {on ? "★ Watching" : "☆ Watch"}
    </button>
  );
}

/** Live candlestick chart with support/resistance + the price-alert box for this token. */
export function ReportChart({ pool, symbol, price }: { pool: string; symbol: string; price: number }) {
  const [iv, setIv] = useState<(typeof IVS)[number]>("1h");
  const [d, setD] = useState<Data | null>(null);
  const [live, setLive] = useState(price);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async (tries = 0) => {
      const r: Data | null = await fetch(`/api/candles?pool=${pool}&interval=${iv}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (stop) return;
      if (r) {
        if (r.token?.price) setLive(r.token.price);
        if (r.candles.length || !r.candlesPending) setD(r);
      }
      // candle feed still warming up: retry soon; otherwise refresh every minute
      timer = setTimeout(() => load(tries + 1), r?.candlesPending && tries < 6 ? 2500 : 60_000);
    };
    setD(null);
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [pool, iv]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="rounded-2xl border border-line bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-muted">Live chart · ${symbol}</div>
          <div className="flex gap-1">
            {IVS.map((x) => (
              <button key={x} type="button" onClick={() => setIv(x)} className={`rounded-lg px-2.5 py-1 font-mono text-xs ${iv === x ? "bg-white/10 text-white" : "text-muted hover:text-white"}`}>{x}</button>
            ))}
          </div>
        </div>
        <div className="h-[320px]">
          {d && d.candles.length ? (
            <PriceChart candles={d.candles} support={d.analysis?.support ?? []} resistance={d.analysis?.resistance ?? []} intraday={iv !== "1d"} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">{d ? "No trades in this window yet." : "Loading candles…"}</div>
          )}
        </div>
      </div>
      <Alerts pool={pool} symbol={symbol} price={live} />
    </div>
  );
}
