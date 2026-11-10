"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppHeader } from "./AppHeader";
import { Pct, TokenIcon, fmtPrice, fmtUsd, usePoll } from "./market-ui";

type Row = {
  ticker: string; name: string; tokenAddress: string; pool: string; image: string | null;
  tokenPrice: number; tokenChange24h: number; liquidity: number; volume24h: number; pools: number;
  stockPrice: number | null; stockPrevClose: number | null; stockChangePct: number | null; marketOpen: boolean; lastStockTrade: string | null;
  premiumPct: number | null; lookalikes: number;
};
type Resp = { rows: Row[]; marketOpen: boolean; updatedAt: number; error?: string };
type SortKey = "ticker" | "premium" | "absPremium" | "liquidity" | "volume";

const premCls = (p: number | null) =>
  p == null ? "text-muted" : Math.abs(p) < 0.25 ? "text-zinc-300" : p > 0 ? "text-emerald-300" : "text-rose-300";
const ago = (iso: string | null) => {
  if (!iso) return "–";
  const m = (Date.now() - Date.parse(iso)) / 60000;
  return m < 60 ? `${Math.round(m)}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export function Stocks() {
  const { data, error } = usePoll<Resp>("/api/stocks", 30_000);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "liquidity", dir: -1 });
  const [minLiq, setMinLiq] = useState(true);

  const rows = useMemo(() => {
    const list = (data?.rows ?? []).filter((r) => !minLiq || r.liquidity >= 50_000);
    const v = (r: Row) =>
      sort.k === "ticker" ? r.ticker : sort.k === "premium" ? r.premiumPct ?? -999 : sort.k === "absPremium" ? Math.abs(r.premiumPct ?? 0) : sort.k === "liquidity" ? r.liquidity : r.volume24h;
    return [...list].sort((a, b) => (v(a) > v(b) ? 1 : v(a) < v(b) ? -1 : 0) * sort.dir);
  }, [data, sort, minLiq]);

  const withPrem = rows.filter((r) => r.premiumPct != null);
  const avg = withPrem.length ? withPrem.reduce((s, r) => s + r.premiumPct!, 0) / withPrem.length : null;
  const widest = [...withPrem].sort((a, b) => Math.abs(b.premiumPct!) - Math.abs(a.premiumPct!))[0];
  const lastTrade = data?.rows.map((r) => r.lastStockTrade).filter(Boolean).sort().at(-1) ?? null;

  const th = (k: SortKey, label: string, cls = "") => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((-s.dir) as 1 | -1) : -1 }))} className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-normal hover:text-white ${cls}`}>
      {label} {sort.k === k ? (sort.dir === 1 ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Stock token premium</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Official Robinhood stock tokens on chain 4663 vs the real share price on its exchange. A premium means the token trades above the stock; a discount, below.
            </p>
          </div>
          <span className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${data?.marketOpen ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-300" : "border-amber/30 bg-amber/5 text-amber"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${data?.marketOpen ? "animate-pulse bg-emerald-400" : "bg-amber"}`} />
            {data ? (data.marketOpen ? "US market open — live comparison" : `US market closed — vs last close (${ago(lastTrade)})`) : "Loading…"}
          </span>
        </div>

        {!data?.marketOpen && data && (
          <div className="mb-5 rounded-xl border border-line bg-panel px-4 py-3 text-sm text-zinc-300">
            The stock market is closed, but these tokens keep trading 24/7. The premium below shows where on-chain traders are pricing each stock <b>before the next open</b>.
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Stock tokens</div><div className="mt-1 font-mono text-xl">{data ? rows.length : "–"}</div></div>
          <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Average premium</div><div className={`mt-1 font-mono text-xl ${premCls(avg)}`}>{avg == null ? "–" : `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`}</div></div>
          <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Widest gap</div><div className={`mt-1 font-mono text-xl ${premCls(widest?.premiumPct ?? null)}`}>{widest ? `${widest.ticker} ${widest.premiumPct! >= 0 ? "+" : ""}${widest.premiumPct!.toFixed(2)}%` : "–"}</div></div>
          <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">On-chain liquidity</div><div className="mt-1 font-mono text-xl">{fmtUsd(rows.reduce((s, r) => s + r.liquidity, 0))}</div></div>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={minLiq} onChange={(e) => setMinLiq(e.target.checked)} className="accent-white" />
            Hide tokens under $50K liquidity (prices there are unreliable)
          </label>
          {error && !data && <span className="text-xs text-rose-300">{error}</span>}
        </div>

        {/* phones */}
        <div className="space-y-2 md:hidden">
          {!data && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-panel" />)}
          {rows.map((r) => (
            <Link key={r.ticker} href={`/app?pool=${r.pool}&interval=1h`} className="block rounded-2xl border border-line bg-panel p-3.5">
              <div className="flex items-center gap-3">
                <TokenIcon t={{ image: r.image, symbol: r.ticker }} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.ticker} <span className="text-xs text-muted">{r.name}</span></div>
                  <div className="text-[11px] text-muted">liquidity {fmtUsd(r.liquidity)}{r.lookalikes ? ` · ${r.lookalikes} lookalike${r.lookalikes > 1 ? "s" : ""}` : ""}</div>
                </div>
                <div className={`text-right font-mono text-lg ${premCls(r.premiumPct)}`}>{r.premiumPct == null ? "–" : `${r.premiumPct >= 0 ? "+" : ""}${r.premiumPct.toFixed(2)}%`}</div>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                <div><div className="text-muted">Token (chain)</div><div className="font-mono">${fmtPrice(r.tokenPrice)}</div></div>
                <div><div className="text-muted">Stock (exchange)</div><div className="font-mono">{r.stockPrice != null ? `$${fmtPrice(r.stockPrice)}` : "–"}</div></div>
              </div>
            </Link>
          ))}
        </div>

        {/* desktop */}
        <div className="hidden overflow-x-auto rounded-2xl border border-line bg-panel md:block">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                {th("ticker", "Stock")}
                <th className="px-3 py-2.5 text-right font-normal">Token price (chain)</th>
                <th className="px-3 py-2.5 text-right font-normal">Stock price (exchange)</th>
                {th("premium", "Premium / discount", "text-right")}
                <th className="px-3 py-2.5 text-right font-normal">Token 24h</th>
                <th className="px-3 py-2.5 text-right font-normal">Stock day</th>
                {th("liquidity", "Liquidity", "text-right")}
                {th("volume", "Volume 24h", "text-right")}
                <th className="px-3 py-2.5 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {!data && Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-line/50"><td colSpan={9} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-white/5" /></td></tr>
              ))}
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-line/50 transition hover:bg-white/[0.03]">
                  <td className="px-3 py-2.5">
                    <Link href={`/app?pool=${r.pool}&interval=1h`} className="group flex items-center gap-2.5">
                      <TokenIcon t={{ image: r.image, symbol: r.ticker }} size={26} />
                      <span>
                        <span className="block font-medium text-white group-hover:underline">{r.ticker}</span>
                        <span className="block max-w-[200px] truncate text-[11px] text-muted">{r.name}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">${fmtPrice(r.tokenPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-300">{r.stockPrice != null ? `$${fmtPrice(r.stockPrice)}` : "–"}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-medium tabular-nums ${premCls(r.premiumPct)}`}>
                    {r.premiumPct == null ? "–" : `${r.premiumPct >= 0 ? "+" : ""}${r.premiumPct.toFixed(2)}%`}
                  </td>
                  <td className="px-3 py-2.5 text-right"><Pct v={r.tokenChange24h} /></td>
                  <td className="px-3 py-2.5 text-right"><Pct v={r.stockChangePct} /></td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-300">{fmtUsd(r.liquidity)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-400">{fmtUsd(r.volume24h)}</td>
                  <td className="px-3 py-2.5 text-[11px] text-muted">
                    {r.premiumPct == null && r.stockPrice != null ? "Gap too large — token may not be 1:1 with the share. " : ""}
                    {r.stockPrice == null ? "No public stock quote. " : ""}
                    {r.lookalikes ? <span className="text-amber">{r.lookalikes} lookalike token{r.lookalikes > 1 ? "s" : ""} use this ticker</span> : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted">
          Token prices: DexScreener (deepest pool of the official “• Robinhood Token”). Stock prices: Yahoo Finance, regular session.
          Gaps can come from fees, liquidity and timing — they are not guaranteed arbitrage. Not financial advice.
        </p>
      </main>
    </div>
  );
}
