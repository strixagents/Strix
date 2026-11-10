"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppHeader } from "./AppHeader";
import { TokenIcon, fmtPrice, fmtUsd, usePoll } from "./market-ui";

type Ev = {
  id: string; type: "liquidity_pull" | "crash" | "mint" | "copycat"; severity: "high" | "medium";
  at: number; symbol: string; name: string; pool: string; token: string; image: string | null;
  title: string; detail: string; liquidity: number; price: number;
};
type Resp = { events: Ev[]; monitoringSince: number; lastScan: number; scans: number; watching: number; error?: string };

const TYPES: { k: Ev["type"]; label: string; icon: string; hint: string }[] = [
  { k: "liquidity_pull", label: "Liquidity pulled", icon: "🧯", hint: "Pool liquidity fell ≥50% from its high in the last hour" },
  { k: "crash", label: "Price crash", icon: "📉", hint: "Price fell ≥50% within an hour" },
  { k: "mint", label: "Supply minted", icon: "🖨️", hint: "New tokens created from nothing (≥2% of supply)" },
  { k: "copycat", label: "Copycat launch", icon: "🎭", hint: "New pool reusing the symbol of an older token" },
];

const ago = (ms: number) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

export function Radar() {
  const { data, error } = usePoll<Resp>("/api/radar", 30_000);
  const [filter, setFilter] = useState<Ev["type"] | null>(null);
  const [highOnly, setHighOnly] = useState(false);

  const events = useMemo(
    () => (data?.events ?? []).filter((e) => (!filter || e.type === filter) && (!highOnly || e.severity === "high")),
    [data, filter, highOnly]
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of data?.events ?? []) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [data]);

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Rug Radar
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-400" />
              </span>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Live watch over Robinhood Chain pools: liquidity pulls, price crashes, sudden supply mints and copycat launches — straight from DEX and on-chain data.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel px-3 py-2 text-right font-mono text-[11px] text-muted">
            {data ? (
              <>
                watching <span className="text-white">{data.watching}</span> pools · scan every 2 min
                <br />
                last scan {data.lastScan ? ago(data.lastScan) : "—"} · monitoring since {new Date(data.monitoringSince).toLocaleTimeString()}
              </>
            ) : (
              "starting radar…"
            )}
          </div>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setFilter(null)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!filter ? "border-white bg-white text-ink" : "border-line text-muted hover:text-white"}`}>
            All {data ? data.events.length : ""}
          </button>
          {TYPES.map((t) => (
            <button
              key={t.k}
              title={t.hint}
              onClick={() => setFilter(filter === t.k ? null : t.k)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${filter === t.k ? "border-rose-400/40 bg-rose-400/10 text-rose-200" : "border-line text-muted hover:text-white"}`}
            >
              {t.icon} {t.label} <span className="opacity-60">{counts[t.k] ?? 0}</span>
            </button>
          ))}
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted">
            <input type="checkbox" checked={highOnly} onChange={(e) => setHighOnly(e.target.checked)} className="accent-white" />
            High severity only
          </label>
        </div>

        {error && !data && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        {!data && (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-line bg-panel" />)}</div>
        )}

        {data && events.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            No {filter ? TYPES.find((t) => t.k === filter)?.label.toLowerCase() : "red-flag"} events since monitoring started. The radar keeps scanning every 2 minutes.
          </div>
        )}

        <ul className="space-y-2">
          {events.map((e) => {
            const t = TYPES.find((x) => x.k === e.type)!;
            return (
              <li key={e.id} className={`flex flex-wrap items-start gap-3 rounded-2xl border p-4 ${e.severity === "high" ? "border-rose-400/30 bg-rose-400/[0.04]" : "border-amber/25 bg-amber/[0.03]"}`}>
                <span className="text-2xl leading-none">{t.icon}</span>
                <TokenIcon t={{ image: e.image, symbol: e.symbol }} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${e.severity === "high" ? "text-rose-200" : "text-amber"}`}>{e.title}</span>
                    <span className="text-sm text-white">{e.symbol}</span>
                    <span className="truncate text-xs text-muted">{e.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${e.severity === "high" ? "bg-rose-400/15 text-rose-300" : "bg-amber/15 text-amber"}`}>{e.severity}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-400">{e.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-muted">
                    <span>price ${fmtPrice(e.price)}</span>
                    <span>liquidity {fmtUsd(e.liquidity)}</span>
                    <span>{ago(e.at)}</span>
                    <Link href={`/app?pool=${e.pool}`} className="text-zinc-300 hover:text-white hover:underline">Open in analyst →</Link>
                    <a href={`https://robinhoodchain.blockscout.com/token/${e.token}`} target="_blank" rel="noreferrer" className="hover:text-white">Explorer ↗</a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 text-xs text-muted">
          Sources: DexScreener / GeckoTerminal pool data and Robinhood Chain RPC mint logs. Official stock tokens, WETH and stablecoins are excluded from mint alerts (their issuers mint normally).
          An alert is a warning sign, not proof of fraud. Not financial advice.
        </p>
      </main>
    </div>
  );
}
