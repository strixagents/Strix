"use client";

import Link from "next/link";
import { Pct, SIGNALS, TokenIcon, fmtPrice, fmtUsd, riskCls, usePoll, type Overview, type Token } from "../market-ui";

type Row = Token & { signals: string[]; risk: { level: "Low" | "Medium" | "High"; score: number; flags: string[] } };

/** Live mini screener (real Robinhood Chain data). */
export function MiniScreener() {
  const { data } = usePoll<{ rows: Row[] }>("/api/screener?list=top", 60_000);
  const rows = data?.rows.filter((r) => r.signals.length).slice(0, 7) ?? null;
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616] text-left">
      <div className="flex items-center justify-between border-b border-[#262626] px-4 py-3">
        <div className="text-sm font-medium">Screener · Robinhood Chain</div>
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
        </span>
      </div>
      <table className="w-full text-[12px] sm:text-[13px]">
        <thead className="text-left text-[#777]">
          <tr>
            <th className="px-4 py-2 font-normal">Token</th>
            <th className="px-2 py-2 text-right font-normal">Price</th>
            <th className="px-2 py-2 text-right font-normal">24h</th>
            <th className="hidden px-2 py-2 text-right font-normal sm:table-cell">Liquidity</th>
            <th className="px-2 py-2 font-normal">Risk</th>
            <th className="hidden px-4 py-2 font-normal sm:table-cell">Signal</th>
          </tr>
        </thead>
        <tbody>
          {rows == null
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-2"><div className="h-4 animate-pulse rounded bg-white/5" /></td></tr>
              ))
            : rows.map((r) => (
                <tr key={r.pool} className="border-t border-[#222]">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2"><TokenIcon t={r} size={18} /><span className="font-medium text-white">{r.symbol}</span></span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums text-zinc-300">${fmtPrice(r.price)}</td>
                  <td className="px-2 py-2 text-right"><Pct v={r.change.h24} /></td>
                  <td className="hidden px-2 py-2 text-right font-mono text-zinc-400 sm:table-cell">{fmtUsd(r.liquidity)}</td>
                  <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] ${riskCls[r.risk.level]}`}>{r.risk.level}</span></td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-300">{SIGNALS[r.signals[0]]?.label ?? r.signals[0]}</span>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

type Candle = { time: number; open: number; high: number; low: number; close: number };
type CandleResp = {
  token: Token & { risk?: { level: "Low" | "Medium" | "High"; flags: string[] } };
  candles: Candle[];
  analysis: { bias: string; rsi: number | null; ema50: number | null; support: { price: number }[]; resistance: { price: number }[] } | null;
  candlesPending?: boolean;
};

/** Split view: a real mini chart of a liquid Robinhood Chain token + a factual summary built from its live analysis. */
export function LiveAgentPanel() {
  const { data: ov } = usePoll<Overview>("/api/overview", 120_000);
  // an established, liquid token (pool older than 3 days) so the chart has real history
  const pick = ov?.tokens.find((t) => t.symbol.toUpperCase() !== "WETH" && t.liquidity > 1_000_000 && (t.ageHours ?? 0) > 72 && !t.risk?.flags.includes("copycat"));
  const { data } = usePoll<CandleResp>(pick ? `/api/candles?pool=${pick.pool}&interval=1h` : null, 60_000);
  const c = data?.candles?.slice(-28) ?? [];
  const a = data?.analysis;
  const t = data?.token;

  const W = 180, H = 90;
  const lo = c.length ? Math.min(...c.map((x) => x.low)) : 0;
  const hi = c.length ? Math.max(...c.map((x) => x.high)) : 1;
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const s1 = a?.support.find((s) => s.price >= lo && s.price <= hi)?.price;
  const r1 = a?.resistance.find((s) => s.price >= lo && s.price <= hi)?.price;
  const step = c.length ? (W - 14) / c.length : 0;
  const tone = !a ? "text-zinc-400 bg-white/5" : /bull/i.test(a.bias) ? "text-emerald-300 bg-emerald-400/10" : /bear/i.test(a.bias) ? "text-rose-300 bg-rose-400/10" : "text-amber bg-amber/10";

  return (
    <div className="grid overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616] text-left sm:grid-cols-[1.3fr_1fr]">
      <div className="border-b border-[#262626] p-4 sm:border-b-0 sm:border-r">
        <div className="mb-3 flex items-center justify-between text-xs text-[#888]">
          <span className="flex items-center gap-2 font-mono text-zinc-300">
            {t && <TokenIcon t={t} size={16} />}
            {t ? `${t.symbol} / ${t.quote} · 1h` : "Loading live chart…"}
          </span>
          {a && <span className={`rounded px-1.5 py-0.5 ${tone}`}>{a.bias}</span>}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full">
          {c.length === 0 && <rect x="0" y="0" width={W} height={H} fill="rgba(255,255,255,0.03)" rx="4" />}
          {s1 != null && (
            <>
              <line x1="0" x2={W} y1={y(s1)} y2={y(s1)} stroke="#34d399" strokeDasharray="3 3" strokeOpacity=".6" />
              <text x="2" y={y(s1) - 2} fontSize="6" fill="#34d399">S1</text>
            </>
          )}
          {r1 != null && (
            <>
              <line x1="0" x2={W} y1={y(r1)} y2={y(r1)} stroke="#fb7185" strokeDasharray="3 3" strokeOpacity=".6" />
              <text x="2" y={y(r1) - 2} fontSize="6" fill="#fb7185">R1</text>
            </>
          )}
          {c.map((k, i) => {
            const up = k.close >= k.open;
            const x = 10 + i * step;
            return (
              <g key={k.time}>
                <line x1={x} x2={x} y1={y(k.high)} y2={y(k.low)} stroke={up ? "#34d399" : "#fb7185"} strokeWidth=".8" />
                <rect x={x - step * 0.3} width={Math.max(step * 0.6, 1)} y={y(Math.max(k.open, k.close))} height={Math.max(Math.abs(y(k.open) - y(k.close)), 1)} fill={up ? "#34d399" : "#fb7185"} rx=".6" />
              </g>
            );
          })}
        </svg>
        <div className="mt-3 rounded-lg border border-[#262626] bg-[#111] p-3 text-[12px] text-zinc-300">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-[#888]">
            <span className="grid h-4 w-4 place-items-center rounded bg-white text-[9px] font-bold text-black">S</span> Strix · live summary
          </div>
          {t && a ? (
            <>
              {t.symbol} trades at ${fmtPrice(t.price)} ({t.change.h24 >= 0 ? "+" : ""}{t.change.h24.toFixed(2)}% 24h), {a.ema50 != null ? (t.price > a.ema50 ? "above" : "below") : "near"} its 1h EMA50.
              {" "}RSI {a.rsi?.toFixed(0) ?? "–"}.{s1 != null ? ` Support $${fmtPrice(s1)}` : ""}{s1 != null && r1 != null ? "," : ""}{r1 != null ? ` resistance $${fmtPrice(r1)}` : ""}{s1 != null || r1 != null ? "." : ""}
              {" "}Liquidity {fmtUsd(t.liquidity)} · risk {t.risk?.level ?? "–"}.
            </>
          ) : (
            <span className="text-zinc-500">{t ? `${t.symbol} ${fmtPrice(t.price)} · liquidity ${fmtUsd(t.liquidity)} — loading candles…` : "Reading live Robinhood Chain data…"}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col p-4 text-[12px]">
        <div className="mx-auto mb-3 mt-2 grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-black">S</div>
        <p className="text-center text-[#aaa]">Strix Agent reads live Robinhood Chain pools, candles and risk for every token you ask about.</p>
        <p className="mt-4 text-[#ccc]">Ask Strix to:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[#aaa]">
          <li>Analyze any token</li>
          <li>Find what&apos;s moving — with a risk score</li>
          <li>Vet new launches for rug risk</li>
          <li>Scan any wallet or the Rug Radar</li>
        </ul>
        <Link href={t ? `/agent?q=${encodeURIComponent(`Full due diligence on ${t.symbol}`)}` : "/agent"} className="mt-auto block rounded-lg border border-[#3b5bdb]/60 bg-[#111] px-3 py-3 text-[#777] transition hover:text-white">
          Ask Strix about {t?.symbol ?? "a token"}…
        </Link>
      </div>
    </div>
  );
}

type Scorecard = { score: number; grade: string; verdict: string; checks: { key: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail: string }[] };

/** Live rug-risk check on the riskiest actively-traded token right now (real token, real scorecard). */
export function LiveRiskCheck() {
  // uses the already-cached overview list (fast) — the riskiest token among the most traded ones
  const { data: ov } = usePoll<Overview>("/api/overview", 300_000);
  const pick = ov?.tokens.filter((t) => t.liquidity > 0 && t.risk).sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0))[0];
  const { data } = usePoll<{ token: Token; scorecard: Scorecard }>(pick ? `/api/analyst?pool=${pick.pool}` : null, 300_000);
  const sc = data?.scorecard;
  const tk = data?.token ?? pick;
  const bad = sc ? sc.checks.filter((c) => c.status === "fail" || c.status === "warn").slice(0, 4) : [];
  const col = !sc ? "text-zinc-400" : sc.grade === "A" || sc.grade === "B" ? "text-emerald-300" : sc.grade === "C" ? "text-amber" : "text-rose-300";

  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#161616] p-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {tk && <TokenIcon t={tk} size={20} />}
          <span className="truncate">Risk check · {tk ? `$${tk.symbol}` : "loading…"}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded bg-white/5 px-2 py-0.5 text-[11px] text-[#aaa]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live · riskiest of the most traded
        </span>
      </div>
      {sc ? (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className={`text-4xl font-semibold ${col}`}>{sc.score}</span>
            <span className={`mb-1 rounded bg-white/5 px-2 py-0.5 text-sm ${col}`}>Grade {sc.grade} · {sc.verdict}</span>
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/5">
            <div className="bg-gradient-to-r from-rose-400 via-amber to-emerald-400" style={{ width: `${sc.score}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
            {(bad.length ? bad : sc.checks.slice(0, 4)).map((c) => (
              <div key={c.key} className={`rounded-lg border p-2.5 ${c.status === "fail" ? "border-rose-400/25 bg-rose-400/5" : c.status === "warn" ? "border-amber/25 bg-amber/5" : "border-[#2a2a2a] bg-[#111]"}`}>
                <div className="text-[#aaa]">{c.label}</div>
                <div className={`mt-0.5 ${c.status === "fail" ? "text-rose-300" : c.status === "warn" ? "text-amber" : "text-white"}`}>{c.detail}</div>
              </div>
            ))}
          </div>
          {tk && (
            <Link href={`/app?pool=${tk.pool}`} className="mt-4 inline-block text-[12px] text-zinc-400 hover:text-white">
              Open {tk.symbol} in the analyst →
            </Link>
          )}
        </>
      ) : (
        <div className="mt-5 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
      )}
    </div>
  );
}

/** Live chain pulse: top tokens + chain stats. */
export function LiveChainPulse() {
  const { data } = usePoll<Overview>("/api/overview", 60_000);
  const items = data ? data.tokens.slice(0, 6) : [];
  return (
    <div className="space-y-2 rounded-xl border border-[#2a2a2a] bg-[#161616] p-3 text-left">
      {data && (
        <div className="grid grid-cols-3 gap-2 text-[12px]">
          <div className="rounded-lg bg-[#111] p-3"><div className="text-[#888]">DEX volume 24h</div><div className="mt-1 font-mono text-base text-white">{fmtUsd(data.stats.volume24h)}</div></div>
          <div className="rounded-lg bg-[#111] p-3"><div className="text-[#888]">Liquidity</div><div className="mt-1 font-mono text-base text-white">{fmtUsd(data.stats.liquidity)}</div></div>
          <div className="rounded-lg bg-[#111] p-3"><div className="text-[#888]">Block</div><div className="mt-1 font-mono text-base text-white">{data.network?.block.toLocaleString() ?? "–"}</div></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.length === 0
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-white/5" />)
          : items.map((t) => (
              <Link key={t.pool} href={`/app?pool=${t.pool}`} className="rounded-lg border border-[#262626] bg-[#111] p-3 transition hover:border-[#3a3a3a]">
                <div className="flex items-center gap-2 text-[12px] text-[#aaa]"><TokenIcon t={t} size={16} />{t.symbol}</div>
                <div className="mt-1 font-mono text-base tabular-nums text-white">${fmtPrice(t.price)}</div>
                <Pct v={t.change.h24} className="text-[12px]" />
              </Link>
            ))}
      </div>
    </div>
  );
}

/** Live "feeds operational" footer badge (RPC + market data). */
export function StatusDot() {
  const { data, error } = usePoll<{ block?: number; error?: string }>("/api/network", 30_000);
  const ok = !!data?.block && !error;
  return (
    <span className={`flex items-center gap-2 text-sm ${ok ? "text-emerald-400" : error ? "text-rose-400" : "text-muted"}`}>
      <span className={`grid h-5 w-5 place-items-center rounded-full ${ok ? "bg-emerald-400/20" : "bg-white/5"}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : error ? "bg-rose-400" : "bg-zinc-500"}`} />
      </span>
      {ok ? `Robinhood Chain operational · block ${data!.block!.toLocaleString()}` : error ? "RPC degraded" : "Checking chain…"}
    </span>
  );
}

/** Live prices of the top tokens, each one a shortcut to set a real alert in the analyst. */
export function LiveAlertPreview() {
  const { data } = usePoll<Overview>("/api/overview", 30_000);
  const list = data?.tokens.filter((t) => t.liquidity > 500_000 && (t.ageHours ?? 0) > 72 && !t.risk?.flags.includes("copycat")).slice(0, 4) ?? [];
  return (
    <div className="space-y-1 p-3 leading-relaxed">
      {list.length === 0 && <div className="px-1 py-2 text-zinc-500">Loading live prices…</div>}
      {list.map((t) => (
        <Link key={t.pool} href={`/app?pool=${t.pool}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-zinc-300 transition hover:bg-white/[0.04]">
          <span className="text-teal-300">●</span>
          <span className="w-20 truncate text-white">{t.symbol}</span>
          <span className="tabular-nums">${fmtPrice(t.price)}</span>
          <Pct v={t.change.h24} className="text-xs" />
          <span className="ml-auto text-[11px] text-[#666]">set alert →</span>
        </Link>
      ))}
    </div>
  );
}
