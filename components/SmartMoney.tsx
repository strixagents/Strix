"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppHeader } from "./AppHeader";
import { fmtUsd, usePoll } from "./market-ui";

type Pos = { symbol: string; pool: string; pnlUsd: number; boughtUsd: number; soldUsd: number; trades: number };
type Trader = {
  wallet: string; pnlUsd: number; volumeUsd: number; trades: number; tokens: number; winRate: number; automated: boolean;
  lastActive: string; txCount: number | null; best: Pos | null; positions: Pos[];
};
type Resp = { traders: Trader[]; pools: { symbol: string; pool: string }[]; botsRemoved: number; windowHours: number; updatedAt: number; error?: string };
type SortKey = "pnl" | "volume" | "trades";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(n))}`;
const ago = (iso: string) => {
  const m = (Date.now() - Date.parse(iso)) / 60000;
  return m < 60 ? `${Math.round(m)}m ago` : `${Math.round(m / 60)}h ago`;
};

export function SmartMoney() {
  const { data, error } = usePoll<Resp>("/api/smart-money", 120_000);
  const [sort, setSort] = useState<SortKey>("pnl");
  const [hideAuto, setHideAuto] = useState(false);

  const rows = useMemo(() => {
    const l = (data?.traders ?? []).filter((t) => !hideAuto || !t.automated);
    const v = (t: Trader) => (sort === "pnl" ? t.pnlUsd : sort === "volume" ? t.volumeUsd : t.trades);
    return [...l].sort((a, b) => v(b) - v(a)).slice(0, 50);
  }, [data, sort, hideAuto]);

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Smart money</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Real wallets ranked by their trading on Robinhood Chain&apos;s most liquid tokens{data ? ` over the last ~${data.windowHours}h` : ""}.
            PnL = sold − bought + remaining tokens at today&apos;s price. Bots and order relayers are removed automatically.
          </p>
        </div>

        {data && (
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Wallets ranked</div><div className="mt-1 font-mono text-xl">{data.traders.length}</div></div>
            <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Bots removed</div><div className="mt-1 font-mono text-xl">{data.botsRemoved}</div></div>
            <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Tokens tracked</div><div className="mt-1 truncate font-mono text-sm leading-7" title={data.pools.map((p) => p.symbol).join(", ")}>{data.pools.map((p) => p.symbol).join(" · ")}</div></div>
            <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Updated</div><div className="mt-1 font-mono text-xl">{new Date(data.updatedAt).toLocaleTimeString()}</div></div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line p-1 text-sm">
            {([
              ["pnl", "Top PnL"],
              ["volume", "Biggest volume"],
              ["trades", "Most active"],
            ] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={`rounded-lg px-3 py-1.5 ${sort === k ? "bg-white text-ink" : "text-muted hover:text-white"}`}>{l}</button>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={hideAuto} onChange={(e) => setHideAuto(e.target.checked)} className="accent-white" />
            Hide automated wallets (&gt;10k transactions)
          </label>
        </div>

        {error && !data && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {!data && !error && (
          <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-muted">
            <div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulse rounded-full bg-white/70" />Reading recent trades on the most liquid Robinhood Chain pools…</div>
          </div>
        )}

        {data && (
          <ol className="space-y-2">
            {rows.map((t, i) => (
              <li key={t.wallet} className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-sm ${i < 3 ? "bg-amber/15 text-amber" : "bg-white/5 text-muted"}`}>{i + 1}</span>
                  <Link href={`/wallet?address=${t.wallet}`} className="font-mono text-sm text-white hover:underline">{short(t.wallet)}</Link>
                  {t.automated && (
                    <span title={`${t.txCount?.toLocaleString("en-US")} transactions sent — likely an automated strategy`} className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber">AUTOMATED</span>
                  )}
                  <span className="text-[11px] text-muted">{t.txCount != null ? `${t.txCount.toLocaleString("en-US")} tx lifetime · ` : ""}active {ago(t.lastActive)}</span>
                  <span className={`ml-auto font-mono text-lg ${t.pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signed(t.pnlUsd)}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-6">
                  <div><div className="text-muted">Volume</div><div className="font-mono text-zinc-200">{fmtUsd(t.volumeUsd)}</div></div>
                  <div><div className="text-muted">Trades</div><div className="font-mono text-zinc-200">{t.trades}</div></div>
                  <div><div className="text-muted">Win rate</div><div className="font-mono text-zinc-200">{Math.round(t.winRate * 100)}%</div></div>
                  <div className="col-span-3">
                    <div className="text-muted">Positions</div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.positions.map((p) => (
                        <Link key={p.pool} href={`/app?pool=${p.pool}`} className={`rounded border px-1.5 py-0.5 font-mono ${p.pnlUsd >= 0 ? "border-emerald-400/25 text-emerald-300" : "border-rose-400/25 text-rose-300"}`}>
                          {p.symbol} {signed(p.pnlUsd)}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-5 text-xs text-muted">
          Built from DEX trades of $250+ on {data?.pools.length ?? "the most liquid"} pools (GeckoTerminal), attributed to the address that sent each transaction.
          A short window favours active traders; past results don&apos;t predict future ones. Not financial advice.
        </p>
      </main>
    </div>
  );
}
