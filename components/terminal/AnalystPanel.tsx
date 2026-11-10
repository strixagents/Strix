"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtPrice, fmtUsd } from "../market-ui";

type Check = { key: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail: string };
type Report = {
  info: {
    holders: { count: number | null; top10: number | null; top11_30: number | null; top31_50: number | null; rest: number | null };
    gtScore: number | null; verified: boolean; honeypot: string; developer: string | null; developerHoldingPct: number | null;
    websites: string[]; twitter: string | null; telegram: string | null; discord: string | null; description: string | null;
  } | null;
  whales: {
    minUsd: number; trades: { kind: "buy" | "sell"; usd: number; amount: number; price: number; wallet: string; tx: string; time: string }[];
    buysUsd: number; sellsUsd: number; buys: number; sells: number; wallets: number; pressure: string; washSuspect: boolean; topWalletShare: number;
    topAccumulators: { wallet: string; netUsd: number; trades: number; txCount?: number; bot?: boolean }[]; topSellers: { wallet: string; netUsd: number; trades: number; txCount?: number; bot?: boolean }[]; botShare?: number;
  } | null;
  transfers: { kind: string; from: string; to: string; amount: number; usd: number; tx: string }[];
  scorecard: { score: number; grade: string; verdict: string; checks: Check[] };
  error?: string;
};

const EXPLORER = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
};
const gradeCls: Record<string, string> = {
  A: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  B: "text-lime-300 border-lime-400/40 bg-lime-400/10",
  C: "text-amber border-amber/40 bg-amber/10",
  D: "text-orange-300 border-orange-400/40 bg-orange-400/10",
  F: "text-rose-300 border-rose-400/40 bg-rose-400/10",
};
const icon = { pass: "✓", warn: "!", fail: "✕", info: "i" };
const iconCls = { pass: "bg-emerald-400/15 text-emerald-300", warn: "bg-amber/15 text-amber", fail: "bg-rose-400/15 text-rose-300", info: "bg-white/10 text-zinc-400" };

/** Wallet link → opens it in the Strix wallet scanner (holdings + what it traded). */
function Wallet({ a }: { a: string }) {
  return (
    <Link href={`/wallet?address=${a}`} className="font-mono text-zinc-300 hover:text-white hover:underline" title="Open in wallet scanner">
      {short(a)}
    </Link>
  );
}

export function AnalystPanel({ pool, symbol }: { pool: string | null; symbol: string }) {
  const [tab, setTab] = useState<"score" | "whales" | "holders">("score");
  const [r, setR] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pool) return;
    let alive = true;
    setLoading(true);
    setR(null);
    const load = () =>
      fetch(`/api/analyst?pool=${pool}`)
        .then((x) => x.json())
        .then((j: Report) => alive && setR(j))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pool]);

  const w = r?.whales;
  const h = r?.info?.holders;
  const flowTotal = (w?.buysUsd ?? 0) + (w?.sellsUsd ?? 0);

  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 pt-3">
        <div className="flex items-center gap-2 pb-3 text-[11px] uppercase tracking-wide text-muted">
          Analyst · {symbol}
          {loading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />}
        </div>
        <div className="flex gap-1 text-sm">
          {([
            ["score", "Scorecard"],
            ["whales", "🐋 Whales"],
            ["holders", "👥 Holders"],
          ] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 pb-2.5 ${tab === k ? "border-white text-white" : "border-transparent text-muted hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {!r ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />)}</div>
        ) : r.error ? (
          <p className="text-sm text-rose-300">{r.error}</p>
        ) : tab === "score" ? (
          <div>
            <div className="mb-4 flex items-center gap-4">
              <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl border text-3xl font-semibold ${gradeCls[r.scorecard.grade]}`}>{r.scorecard.grade}</div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{r.scorecard.score}<span className="text-base text-muted"> / 100</span></div>
                <div className="text-sm text-zinc-400">{r.scorecard.verdict}</div>
              </div>
            </div>
            <ul className="divide-y divide-line">
              {r.scorecard.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3 py-2">
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${iconCls[c.status]}`}>{icon[c.status]}</span>
                  <span className="w-40 shrink-0 text-sm text-zinc-200">{c.label}</span>
                  <span className="text-sm text-zinc-400">{c.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">Automated checks from on-chain & DEX data. A good grade is not a guarantee — always verify the contract.</p>
          </div>
        ) : tab === "whales" ? (
          !w ? (
            <p className="text-sm text-muted">Whale data unavailable right now.</p>
          ) : (
            <div className="space-y-4">
              {w.washSuspect && (
                <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
                  ⚠ {Math.round(w.topWalletShare * 100)}% of large trades come from one wallet buying and selling — likely wash trading. Volume is not real demand.
                </div>
              )}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-emerald-400">{w.buys} whale buys · {fmtUsd(w.buysUsd)}</span>
                  <span className="text-muted">{w.pressure} · trades ≥ {fmtUsd(w.minUsd)} · 24h</span>
                  <span className="text-rose-400">{fmtUsd(w.sellsUsd)} · {w.sells} sells</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
                  <div className="bg-emerald-400" style={{ width: `${flowTotal ? (w.buysUsd / flowTotal) * 100 : 50}%` }} />
                  <div className="flex-1 bg-rose-400/80" />
                </div>
              </div>

              <p className="-mt-1 text-[11px] text-muted">
                Wallet = the address that sent the transaction. Click one to see everything it holds and trades.
                {w.botShare != null && w.botShare > 0.05 && <span className="text-amber"> {Math.round(w.botShare * 100)}% of this flow comes from bots/relayers.</span>}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { t: "Top accumulators", rows: w.topAccumulators, cls: "text-emerald-300" },
                  { t: "Top sellers", rows: w.topSellers, cls: "text-rose-300" },
                ].map((g) => (
                  <div key={g.t} className="rounded-xl border border-line p-3">
                    <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">{g.t}</div>
                    {g.rows.length === 0 ? (
                      <p className="text-xs text-muted">None</p>
                    ) : (
                      <ul className="space-y-1 text-xs">
                        {g.rows.map((x) => (
                          <li key={x.wallet} className="flex justify-between">
                            <span className="flex items-center gap-1.5"><Wallet a={x.wallet} />{x.bot && <span title={`${x.txCount?.toLocaleString("en-US")} transactions sent — a bot or order relayer, not a person`} className="rounded bg-amber/15 px-1 text-[9px] font-semibold text-amber">BOT</span>}</span>
                            <span className={`font-mono ${g.cls}`}>{x.netUsd > 0 ? "+" : "−"}{fmtUsd(Math.abs(x.netUsd))} · {x.trades}tx</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Live whale feed</div>
                <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
                  {w.trades.length === 0 && <li className="text-muted">No trades above {fmtUsd(w.minUsd)} in the last 24h.</li>}
                  {w.trades.map((t) => (
                    <li key={t.tx + t.wallet + t.usd} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                      <span className={`w-10 font-medium ${t.kind === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{t.kind.toUpperCase()}</span>
                      <span className="w-20 font-mono text-white">{fmtUsd(t.usd)}</span>
                      <span className="hidden font-mono text-zinc-500 sm:inline">@ ${fmtPrice(t.price)}</span>
                      <span className="ml-auto"><Wallet a={t.wallet} /></span>
                      <a href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noreferrer" className="w-10 text-right text-zinc-500 hover:text-white">{ago(t.time)} ↗</a>
                    </li>
                  ))}
                </ul>
              </div>

              {r.transfers.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Large wallet transfers (last ~hour, from RPC)</div>
                  <ul className="space-y-1 text-xs">
                    {r.transfers.slice(0, 8).map((t) => (
                      <li key={t.tx + t.from + t.to} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                        <span className={`w-16 font-medium ${t.kind === "mint" ? "text-amber" : t.kind === "burn" ? "text-sky-300" : "text-zinc-300"}`}>{t.kind}</span>
                        <span className="w-20 font-mono text-white">{fmtUsd(t.usd)}</span>
                        <span className="flex items-center gap-1"><Wallet a={t.from} /> → <Wallet a={t.to} /></span>
                        <a href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noreferrer" className="ml-auto text-zinc-500 hover:text-white">↗</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        ) : !r.info ? (
          <p className="text-sm text-muted">Holder data unavailable for this token.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-line p-3"><div className="text-[11px] uppercase text-muted">Holders</div><div className="mt-1 font-mono text-lg">{h?.count?.toLocaleString("en-US") ?? "–"}</div></div>
              <div className="rounded-xl border border-line p-3"><div className="text-[11px] uppercase text-muted">Top 10 hold</div><div className={`mt-1 font-mono text-lg ${h?.top10 != null && h.top10 > 80 ? "text-amber" : ""}`}>{h?.top10 != null ? `${h.top10.toFixed(1)}%` : "–"}</div></div>
              <div className="rounded-xl border border-line p-3"><div className="text-[11px] uppercase text-muted">GT score</div><div className="mt-1 font-mono text-lg">{r.info.gtScore != null ? r.info.gtScore.toFixed(0) : "–"}</div></div>
              <div className="rounded-xl border border-line p-3"><div className="text-[11px] uppercase text-muted">Dev holds</div><div className="mt-1 font-mono text-lg">{r.info.developerHoldingPct != null ? `${r.info.developerHoldingPct.toFixed(2)}%` : "–"}</div></div>
            </div>

            {h?.top10 != null && (
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Supply distribution</div>
                <div className="flex h-3 overflow-hidden rounded-full">
                  {[
                    { v: h.top10, c: "bg-rose-400", l: "Top 10" },
                    { v: h.top11_30, c: "bg-amber", l: "11–30" },
                    { v: h.top31_50, c: "bg-violet", l: "31–50" },
                    { v: h.rest != null && h.rest > 0 ? h.rest : 0, c: "bg-emerald-400", l: "Rest" },
                  ].map((s) => <div key={s.l} className={s.c} style={{ width: `${Math.max(0, s.v ?? 0)}%` }} title={`${s.l}: ${(s.v ?? 0).toFixed(1)}%`} />)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400" />Top 10 {h.top10?.toFixed(1)}%</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber" />11–30 {h.top11_30?.toFixed(1)}%</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-violet" />31–50 {h.top31_50?.toFixed(1)}%</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Top holders usually include the liquidity pool and token contracts, not just people.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 text-xs">
              {r.info.websites.slice(0, 2).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-zinc-300 hover:text-white">🌐 {u.replace(/^https?:\/\//, "").slice(0, 28)}</a>)}
              {r.info.twitter && <a href={`https://x.com/${r.info.twitter}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-zinc-300 hover:text-white">𝕏 @{r.info.twitter}</a>}
              {r.info.telegram && <a href={`https://t.me/${r.info.telegram}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-zinc-300 hover:text-white">✈ {r.info.telegram}</a>}
              {r.info.developer && <span className="rounded-lg border border-line px-2.5 py-1 text-zinc-400">Deployer <Wallet a={r.info.developer} /></span>}
              {r.info.verified && <span className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">✓ Verified info</span>}
            </div>
            {r.info.description && <p className="line-clamp-3 text-xs leading-relaxed text-zinc-400">{r.info.description}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
