"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "../Logo";
import {
  NetworkBadge, Pct, RISK_LABELS, SIGNALS, TokenIcon, fmtAge, fmtPrice, fmtUsd, riskCls, toneCls, usePoll,
  type Overview, type Token,
} from "../market-ui";
import { AppNav } from "../AppHeader";
import { AgentChat } from "./AgentChat";
import { PriceChart, type Candle } from "./PriceChart";
import { Alerts } from "./Alerts";
import { AnalystPanel } from "./AnalystPanel";

const INTERVALS = ["15m", "1h", "4h", "1d", "1w"] as const;

type Analysis = {
  price: number; ema20: number | null; ema50: number | null; ema200: number | null;
  rsi: number | null; macd: { line: number | null; signal: number | null; hist: number | null };
  atr: number | null; atrPct: number | null; bollinger: { upper: number; middle: number; lower: number } | null;
  support: { price: number; touches: number }[]; resistance: { price: number; touches: number }[];
  volumeVsAvg20: number | null; score: number; bias: string; reasons: string[];
};
type CandleResp = {
  token: Token & { links: { explorer: string; geckoterminal: string; dexscreener: string } };
  interval: string; candles: Candle[]; candlesPending?: boolean; candleError: string | null; analysis: Analysis | null; error?: string;
};

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-0.5 font-mono text-sm tabular-nums ${tone ?? "text-white"}`}>{value}</div>
    </div>
  );
}

function Watchlist({ tokens, active, onPick }: { tokens: Token[]; active: string; onPick: (pool: string) => void }) {
  return (
    <div>
      <div className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-wide text-muted">Top by volume · Robinhood Chain</div>
      {tokens.map((t) => (
        <button
          key={t.pool}
          onClick={() => onPick(t.pool)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.04] ${
            active.toLowerCase() === t.pool.toLowerCase() ? "bg-white/[0.06]" : ""
          }`}
        >
          <TokenIcon t={t} size={26} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{t.symbol}</span>
              {t.risk?.level === "High" && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" title="High risk" />}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-zinc-500">${fmtPrice(t.price)}</div>
          </div>
          <div className="text-right">
            <Pct v={t.change.h24} className="block text-xs" />
            <span className="font-mono text-[10px] text-zinc-500">{fmtUsd(t.volume.h24)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Search({ onPick }: { onPick: (pool: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ pool: string; symbol: string; name: string; liquidity: number; image?: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return setRes([]);
    timer.current = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((j) => setRes(j.results ?? []))
        .catch(() => setRes([]));
    }, 350);
  }, [q]);

  const pick = (pool: string) => {
    onPick(pool);
    setQ("");
    setRes([]);
    setOpen(false);
  };

  return (
    <div className="relative flex-1 sm:max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (res[0]) pick(res[0].pool);
          else if (/^0x[0-9a-fA-F]{40,64}$/.test(q.trim())) pick(q.trim());
        }}
        className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5"
      >
        <span className="text-muted">⌕</span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search token or paste address…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </form>
      {open && res.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          {res.slice(0, 8).map((r) => (
            <button key={r.pool} onMouseDown={() => pick(r.pool)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.05]">
              <TokenIcon t={{ image: r.image ?? null, symbol: r.symbol }} size={22} />
              <span className="text-sm font-medium">{r.symbol}</span>
              <span className="truncate text-xs text-muted">{r.name}</span>
              <span className="ml-auto font-mono text-[11px] text-zinc-500">liq {fmtUsd(r.liquidity)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Terminal() {
  const params = useSearchParams();
  const router = useRouter();
  const [sel, setSel] = useState(params.get("pool") || params.get("q") || "WETH");
  const [interval, setIv] = useState<string>(params.get("interval") || "1h");
  const [data, setData] = useState<CandleResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"chart" | "agent">("chart");

  const { data: ov, error: ovErr } = usePoll<Overview>("/api/overview", 60_000);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const key = /^0x/.test(sel) ? `pool=${sel}` : `q=${encodeURIComponent(sel)}`;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      fetch(`/api/candles?${key}&interval=${interval}`)
        .then((r) => r.json())
        .then((j: CandleResp) => {
          if (!alive) return;
          if (j.error && !j.token) {
            setData((prev) => (prev?.token ? prev : j)); // keep last good view
            return;
          }
          // keep the previous chart on screen while new candles are still coming
          setData((prev) =>
            j.candlesPending && prev?.token?.pool === j.token.pool && prev.interval === j.interval && prev.candles.length
              ? { ...j, candles: prev.candles, analysis: prev.analysis }
              : j
          );
          if (j.candlesPending) retry = setTimeout(load, 2500);
        })
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    load();
    const id = setInterval(load, 90_000);
    return () => {
      alive = false;
      clearInterval(id);
      if (retry) clearTimeout(retry);
    };
  }, [sel, interval]);

  const pool = data?.token?.pool;
  useEffect(() => {
    if (pool) router.replace(`/app?pool=${pool}&interval=${interval}`, { scroll: false });
  }, [pool, interval, router]);

  const focus = useCallback((pool: string, iv: string) => {
    setSel(pool);
    if (INTERVALS.includes(iv as (typeof INTERVALS)[number])) setIv(iv);
  }, []);

  // Show what we already know from the watchlist instantly; the API response replaces it a moment later.
  const selSym = sel.replace(/^\$/, "").toUpperCase();
  const fromList =
    ov?.tokens.find((x) => x.pool.toLowerCase() === sel.toLowerCase()) ??
    ov?.tokens.find((x) => x.symbol.toUpperCase() === selSym && !x.risk?.flags.includes("copycat")) ??
    ov?.tokens.find((x) => x.symbol.toUpperCase() === selSym);
  const fresh = data?.token && (!fromList || data.token.pool.toLowerCase() === fromList.pool.toLowerCase()) ? data.token : null;
  const t: (Token & { links?: CandleResp["token"]["links"] }) | undefined = fresh ?? fromList ?? data?.token;
  const lk = t?.links ?? (t ? { explorer: `https://robinhoodchain.blockscout.com/token/${t.address}`, geckoterminal: `https://www.geckoterminal.com/robinhood/pools/${t.pool}`, dexscreener: `https://dexscreener.com/robinhood/${t.pool}` } : null);
  const a = data?.analysis;
  const biasTone = !a ? "" : a.score >= 15 ? "text-emerald-400" : a.score <= -15 ? "text-rose-400" : "text-amber";
  const buys = t?.txns.h24.buys ?? 0, sells = t?.txns.h24.sells ?? 0;
  const buyPct = buys + sells ? (buys / (buys + sells)) * 100 : 50;

  return (
    // Phones: normal page scroll with a sticky header. Desktop: fixed 3-panel terminal with inner scroll.
    <div className="flex min-h-dvh flex-col bg-ink lg:h-dvh">
      <div className="sticky top-0 z-40 bg-ink/90 backdrop-blur-xl lg:static lg:bg-ink">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo className="h-6 w-6" mono />
        </Link>
        <AppNav className="hidden md:flex" />
        <Search onPick={(p) => setSel(p)} />
        <div className="hidden md:block"><NetworkBadge /></div>
      </header>

      <div className="flex border-b border-line lg:hidden">
        {(["chart", "agent"] as const).map((x) => (
          <button key={x} onClick={() => setTab(x)} className={`flex-1 py-2.5 text-sm ${tab === x ? "border-b-2 border-white text-white" : "text-muted"}`}>
            {x === "chart" ? "Chart & on-chain" : "AI agent"}
          </button>
        ))}
      </div>

      {/* phones: swipeable token strip instead of the sidebar watchlist */}
      {tab === "chart" && ov && (
        <div className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          {ov.tokens.slice(0, 20).map((x) => (
            <button
              key={x.pool}
              onClick={() => setSel(x.pool)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                t?.pool.toLowerCase() === x.pool.toLowerCase() ? "border-white/40 bg-white/10 text-white" : "border-line text-zinc-300"
              }`}
            >
              <TokenIcon t={x} size={16} />
              {x.symbol}
              <Pct v={x.change.h24} className="text-[10px]" />
            </button>
          ))}
        </div>
      )}
      </div>

      <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[250px_1fr_400px]">
        <aside className="hidden min-h-0 overflow-y-auto border-r border-line lg:block">
          {ov ? (
            <Watchlist tokens={ov.tokens} active={t?.pool ?? ""} onPick={setSel} />
          ) : (
            <div className="p-4 text-sm text-muted">{ovErr ? `Feed busy: ${ovErr}` : "Loading Robinhood Chain tokens…"}</div>
          )}
        </aside>

        <section className={`flex-col lg:min-h-0 lg:overflow-y-auto ${tab === "chart" ? "flex" : "hidden"} lg:flex`}>
          {data?.error && !t ? (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-rose-300">{data.error}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
                <div className="flex items-center gap-3">
                  {t && <TokenIcon t={t} size={40} />}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-semibold">{t?.symbol ?? "…"}</h1>
                      <span className="text-sm text-muted">{t?.name}</span>
                      {t && <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">{t.poolName} · {t.dex}</span>}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-2xl tabular-nums">${fmtPrice(t?.price)}</span>
                      <Pct v={t?.change.h24} className="text-sm" />
                      <span className="text-xs text-muted">24h</span>
                    </div>
                  </div>
                </div>
                <div className="flex rounded-lg border border-line p-0.5">
                  {INTERVALS.map((iv) => (
                    <button key={iv} onClick={() => setIv(iv)} className={`rounded-md px-2.5 py-1 font-mono text-xs ${interval === iv ? "bg-white text-ink" : "text-muted hover:text-white"}`}>
                      {iv}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative mx-2 mt-2 h-[320px] shrink-0 sm:h-[440px]">
                {data?.candles?.length ? (
                  <PriceChart candles={data.candles} support={a?.support ?? []} resistance={a?.resistance ?? []} intraday={["15m", "1h", "4h"].includes(interval)} />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted">
                    {loading || data?.candlesPending ? (
                      <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-white/60" />Loading chart…</span>
                    ) : (
                      data?.candleError ?? "No candle history yet for this pool."
                    )}
                  </div>
                )}
                {(loading || data?.candlesPending) && data?.candles?.length ? <div className="absolute right-3 top-2 font-mono text-[10px] text-muted">updating…</div> : null}
                <div className="pointer-events-none absolute left-3 top-2 flex gap-3 font-mono text-[10px]">
                  <span className="text-amber">EMA20</span>
                  <span className="text-violet">EMA50</span>
                  <span className="text-sky-400">EMA200</span>
                </div>
              </div>

              {t && (
                <div className="space-y-4 p-4">
                  {/* on-chain */}
                  <div className="rounded-2xl border border-line bg-panel p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] uppercase tracking-wide text-muted">On-chain · Robinhood Chain</div>
                      {t.risk && (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${riskCls[t.risk.level]}`}>
                          Risk: {t.risk.level} ({t.risk.score})
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat label="Liquidity" value={fmtUsd(t.liquidity)} tone={t.liquidity < 50_000 ? "text-rose-300" : undefined} />
                      <Stat label="Volume 24h" value={fmtUsd(t.volume.h24)} />
                      <Stat label="FDV" value={fmtUsd(t.fdv)} />
                      <Stat label="Pool age" value={fmtAge(t.ageHours)} tone={t.ageHours != null && t.ageHours < 24 ? "text-amber" : undefined} />
                      <Stat label="1h" value={<Pct v={t.change.h1} />} />
                      <Stat label="6h" value={<Pct v={t.change.h6} />} />
                      <Stat label="Buyers 24h" value={t.txns.h24.buyers.toLocaleString()} />
                      <Stat label="Sellers 24h" value={t.txns.h24.sellers.toLocaleString()} />
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between font-mono text-[11px]">
                        <span className="text-emerald-400">{buys.toLocaleString()} buys</span>
                        <span className="text-rose-400">{sells.toLocaleString()} sells</span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-rose-400/70">
                        <div className="bg-emerald-400" style={{ width: `${buyPct}%` }} />
                      </div>
                    </div>
                    {(t.risk?.flags.length || t.signals?.length) ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {t.risk?.flags.map((f) => (
                          <span key={f} title={RISK_LABELS[f]?.hint} className="rounded-md border border-rose-400/30 bg-rose-400/10 px-1.5 py-0.5 text-[11px] text-rose-300">
                            ⚠ {RISK_LABELS[f]?.label ?? f}
                          </span>
                        ))}
                        {t.signals?.map((s) => (
                          <span key={s} title={SIGNALS[s]?.hint} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${toneCls[SIGNALS[s]?.tone ?? "neutral"]}`}>
                            {SIGNALS[s]?.label ?? s}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      <a href={lk!.explorer} target="_blank" rel="noreferrer" className="text-zinc-300 underline-offset-2 hover:underline">Explorer ↗</a>
                      <a href={lk!.geckoterminal} target="_blank" rel="noreferrer" className="text-zinc-300 underline-offset-2 hover:underline">GeckoTerminal ↗</a>
                      <a href={lk!.dexscreener} target="_blank" rel="noreferrer" className="text-zinc-300 underline-offset-2 hover:underline">DexScreener ↗</a>
                      <button onClick={() => navigator.clipboard?.writeText(t.address)} className="font-mono text-zinc-500 hover:text-white" title="Copy token address">
                        {t.address.slice(0, 6)}…{t.address.slice(-4)} ⧉
                      </button>
                    </div>
                  </div>

                  <AnalystPanel pool={t.pool} symbol={t.symbol} />

                  {a && (
                    <>
                      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-4">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-muted">Technical bias ({interval})</div>
                          <div className={`text-2xl font-semibold ${biasTone}`}>{a.bias}</div>
                        </div>
                        <ul className="w-full space-y-0.5 text-xs text-zinc-400">
                          {a.reasons.map((r) => <li key={r}>• {r}</li>)}
                        </ul>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="RSI 14" value={a.rsi?.toFixed(1) ?? "–"} tone={a.rsi == null ? "" : a.rsi > 70 ? "text-rose-400" : a.rsi < 30 ? "text-emerald-400" : undefined} />
                        <Stat label="MACD hist" value={a.macd.hist?.toPrecision(3) ?? "–"} tone={a.macd.hist == null ? "" : a.macd.hist > 0 ? "text-emerald-400" : "text-rose-400"} />
                        <Stat label="ATR %" value={a.atrPct ? `${a.atrPct.toFixed(2)}%` : "–"} />
                        <Stat label="EMA 50" value={fmtPrice(a.ema50)} />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-line bg-panel p-4">
                          <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Key levels</div>
                          <div className="space-y-1 font-mono text-sm">
                            {[...a.resistance].reverse().map((l, i) => (
                              <div key={"r" + i} className="flex justify-between text-rose-300"><span>R{a.resistance.length - i}</span><span>{fmtPrice(l.price)}</span></div>
                            ))}
                            <div className="flex justify-between border-y border-line py-1 text-white"><span>Price</span><span>{fmtPrice(a.price)}</span></div>
                            {a.support.map((l, i) => (
                              <div key={"s" + i} className="flex justify-between text-emerald-300"><span>S{i + 1}</span><span>{fmtPrice(l.price)}</span></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                </div>
              )}

              <div className="px-4 pb-6">
                <Alerts pool={t?.pool ?? null} symbol={t?.symbol ?? ""} price={t?.price ?? null} />
              </div>
            </>
          )}
        </section>

        <aside className={`h-[calc(100dvh-98px)] border-line bg-panel/50 lg:h-auto lg:min-h-0 lg:border-l ${tab === "agent" ? "block" : "hidden"} lg:block`}>
          <AgentChat current={t?.symbol ?? "WETH"} onFocus={focus} />
        </aside>
      </div>
    </div>
  );
}
