"use client";

import { useEffect, useState } from "react";

export type Risk = { flags: string[]; score: number; level: "Low" | "Medium" | "High" };
export type Token = {
  pool: string; poolName: string; dex: string;
  address: string; symbol: string; name: string; image: string | null; quote: string;
  price: number; change: { m5: number; h1: number; h6: number; h24: number };
  volume: { h1: number; h6: number; h24: number };
  txns: { h1: { buys: number; sells: number }; h24: { buys: number; sells: number; buyers: number; sellers: number } };
  liquidity: number; fdv: number | null; mcap: number | null; createdAt: string | null; ageHours: number | null;
  signals?: string[]; risk?: Risk;
};
export type Network = { chainId: number; block: number; gasGwei: number; at: number };
export type Overview = {
  network: Network | null; tokens: Token[]; trending: Token[]; gainers: Token[]; losers: Token[];
  stats: { volume24h: number; liquidity: number; tokens: number }; updatedAt: number;
};

export const SIGNALS: Record<string, { label: string; tone: "bull" | "bear" | "neutral"; hint: string }> = {
  momentum: { label: "Momentum", tone: "bull", hint: "Up on 1h, 6h and 24h" },
  breakout: { label: "24h breakout", tone: "bull", hint: "Up more than 20% in 24h" },
  dip_buy: { label: "Dip in uptrend", tone: "bull", hint: "Up >5% on 24h but pulling back on 1h" },
  volume_spike: { label: "Volume spike", tone: "neutral", hint: "Last hour volume > 3× the 24h hourly average" },
  buy_pressure: { label: "Buy pressure", tone: "bull", hint: "24h buys > 1.5× sells" },
  sell_pressure: { label: "Sell pressure", tone: "bear", hint: "24h sells > 1.5× buys" },
  dumping: { label: "Dumping", tone: "bear", hint: "Down more than 20% in 24h" },
  new_pool: { label: "New pool", tone: "neutral", hint: "Pool created in the last 24h" },
  deep_liquidity: { label: "Deep liquidity", tone: "bull", hint: "More than $1M liquidity" },
};
export const RISK_LABELS: Record<string, { label: string; hint: string }> = {
  low_liquidity: { label: "Low liquidity", hint: "Under $50k — big slippage, easy to manipulate" },
  very_new: { label: "Very new", hint: "Pool younger than 6 hours" },
  fdv_vs_liq: { label: "FDV ≫ liquidity", hint: "FDV more than 50× pool liquidity" },
  extreme_move: { label: "Extreme move", hint: "Moved more than 50% in 24h" },
  few_traders: { label: "Few traders", hint: "Fewer than 25 unique buyers in 24h" },
  sell_pressure: { label: "Heavy selling", hint: "24h sells > 1.5× buys" },
  copycat: { label: "Possible copycat", hint: "An older token on Robinhood Chain uses the same symbol — check the contract address" },
  wash_volume: { label: "Wash volume", hint: "24h volume is more than 50× liquidity — likely wash trading or a drained pool" },
  spoofed_name: { label: "Disguised name", hint: "The name or symbol hides invisible characters so it can look like another token (e.g. a fake USDT)" },
  fake_liquidity: { label: "Fake liquidity", hint: "The pool reports an impossible liquidity figure — real liquidity is unknown" },
  fake_volume: { label: "Fake volume", hint: "Millions in 24h volume from only a handful of trades — the volume figure is spoofed" },
};
export const toneCls = {
  bull: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  bear: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  neutral: "border-amber/30 bg-amber/10 text-amber",
};
export const riskCls = { Low: "text-emerald-300 bg-emerald-400/10", Medium: "text-amber bg-amber/10", High: "text-rose-300 bg-rose-400/10" };

export function fmtPrice(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n === 0) return "0";
  return n.toPrecision(4);
}

export function fmtUsd(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtAge(h: number | null | undefined) {
  if (h == null) return "–";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function Pct({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  if (v == null || !isFinite(v)) return <span className={`text-muted ${className}`}>–</span>;
  return (
    <span className={`${v >= 0 ? "text-emerald-400" : "text-rose-400"} tabular-nums ${className}`}>
      {v >= 0 ? "+" : ""}
      {Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)}%
    </span>
  );
}

export function TokenIcon({ t, size = 28 }: { t: Pick<Token, "image" | "symbol">; size?: number }) {
  const [err, setErr] = useState(false);
  if (t.image && !err)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={t.image} alt="" width={size} height={size} onError={() => setErr(true)} className="shrink-0 rounded-full bg-white/5" style={{ width: size, height: size }} />;
  const hue = [...t.symbol].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-black"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 70% 70%)` }}
    >
      {t.symbol.slice(0, 1)}
    </span>
  );
}

export function Sparkline({ data, up, className = "h-8 w-24" }: { data: number[]; up: boolean; className?: string }) {
  if (data.length < 2) return <div className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${max === min ? 50 : 100 - ((v - min) / (max - min)) * 100}`);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Polls a JSON endpoint; keeps the last good data on errors. */
export function usePoll<T>(url: string | null, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (!alive) return;
        if (j.error) setError(j.error);
        else {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [url, ms]);
  return { data, error };
}

export function NetworkBadge({ compact = false }: { compact?: boolean }) {
  const { data } = usePoll<Network & { error?: string }>("/api/network", 10_000);
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300">
      <span className={`h-1.5 w-1.5 rounded-full ${data?.block ? "animate-pulse bg-emerald-400" : "bg-zinc-500"}`} />
      {compact ? "RH Chain" : "Robinhood Chain"}
      {data?.block ? <span className="text-muted">#{data.block.toLocaleString()}</span> : null}
      {!compact && data?.gasGwei != null ? <span className="hidden text-muted sm:inline">· {data.gasGwei.toFixed(3)} gwei</span> : null}
    </span>
  );
}
