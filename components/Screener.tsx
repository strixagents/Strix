"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "./Logo";
import { NetworkBadge, Pct, RISK_LABELS, SIGNALS, TokenIcon, fmtAge, fmtPrice, fmtUsd, riskCls, toneCls, type Token } from "./market-ui";
import { WalletButton } from "./WalletButton";
import { AppNav } from "./AppHeader";

type List = "top" | "trending" | "new";
type Row = Token & { signals: string[]; risk: { flags: string[]; score: number; level: "Low" | "Medium" | "High" } };

const TABS: { id: List; label: string }[] = [
  { id: "top", label: "Top volume" },
  { id: "trending", label: "Trending" },
  { id: "new", label: "New pools" },
];

type SortKey = "symbol" | "price" | "h1" | "h24" | "volume" | "liquidity" | "fdv" | "age" | "risk" | "signals";
const val = (r: Row, k: SortKey): number | string => {
  switch (k) {
    case "symbol": return r.symbol.toLowerCase();
    case "price": return r.price;
    case "h1": return r.change.h1;
    case "h24": return r.change.h24;
    case "volume": return r.volume.h24;
    case "liquidity": return r.liquidity;
    case "fdv": return r.fdv ?? -1;
    case "age": return r.ageHours ?? 1e9;
    case "risk": return r.risk.score;
    case "signals": return r.signals.length;
  }
};

export function Screener() {
  const [list, setList] = useState<List>("top");
  const [data, setData] = useState<{ rows: Row[]; scannedAt: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [hideHigh, setHideHigh] = useState(false);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "volume", dir: -1 });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    const load = () =>
      fetch(`/api/screener?list=${list}`)
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (j.error) setErr(j.error);
          else setData(j);
        })
        .catch((e) => alive && setErr(e.message))
        .finally(() => alive && setLoading(false));
    load();
    const id = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [list]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.rows.forEach((r) => r.signals.forEach((s) => (c[s] = (c[s] ?? 0) + 1)));
    return c;
  }, [data]);

  const rows = useMemo(() => {
    const l = (data?.rows ?? []).filter((r) => (!filter || r.signals.includes(filter)) && (!hideHigh || r.risk.level !== "High"));
    return [...l].sort((a, b) => {
      const va = val(a, sort.k), vb = val(b, sort.k);
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  }, [data, filter, hideHigh, sort]);

  const th = (k: SortKey, label: string, cls = "") => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((-s.dir) as 1 | -1) : -1 }))} className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-normal hover:text-white ${cls}`}>
      {label} {sort.k === k ? (sort.dir === 1 ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="min-h-dvh bg-ink">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo className="h-6 w-6" mono /> <span className="hidden sm:inline">Strix</span>
        </Link>
        <AppNav />
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:inline"><NetworkBadge /></span>
          <WalletButton className="hidden sm:block" />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Robinhood Chain screener</h1>
            <p className="mt-1 text-sm text-muted">
              Live DEX pools on chain 4663 · on-chain signals &amp; risk flags
              {data?.scannedAt && <> · updated {new Date(data.scannedAt).toLocaleTimeString()}</>}
            </p>
          </div>
          <div className="flex rounded-xl border border-line p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setList(t.id);
                  setFilter(null);
                  setSort({ k: t.id === "new" ? "age" : "volume", dir: t.id === "new" ? 1 : -1 });
                }}
                className={`rounded-lg px-4 py-1.5 text-sm ${list === t.id ? "bg-white text-ink" : "text-muted hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-4 mb-5 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          <button onClick={() => setFilter(null)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${!filter ? "border-white bg-white text-ink" : "border-line text-muted hover:text-white"}`}>
            All
          </button>
          {Object.entries(SIGNALS).map(([k, s]) => (
            <button
              key={k}
              title={s.hint}
              onClick={() => setFilter(filter === k ? null : k)}
              disabled={!counts[k]}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition disabled:opacity-30 ${filter === k ? toneCls[s.tone] : "border-line text-muted hover:text-white"}`}
            >
              {s.label} <span className="opacity-60">{counts[k] ?? 0}</span>
            </button>
          ))}
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted">
            <input type="checkbox" checked={hideHigh} onChange={(e) => setHideHigh(e.target.checked)} className="accent-white" />
            Hide high-risk
          </label>
        </div>

        {err && !data && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{err}</div>}

        {/* phones: one card per token */}
        <div className="space-y-2 md:hidden">
          {loading && !data
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-panel" />)
            : rows.map((r) => {
                const tot = r.txns.h24.buys + r.txns.h24.sells;
                const bp = tot ? (r.txns.h24.buys / tot) * 100 : 50;
                return (
                  <Link key={r.pool} href={`/app?pool=${r.pool}&interval=1h`} className="block rounded-2xl border border-line bg-panel p-3.5 active:bg-white/[0.04]">
                    <div className="flex items-center gap-3">
                      <TokenIcon t={r} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-white">{r.symbol}</span>
                          {r.risk.flags.includes("copycat") && <span className="rounded border border-rose-400/40 bg-rose-400/10 px-1 text-[10px] text-rose-300">copycat?</span>}
                          <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-medium ${riskCls[r.risk.level]}`}>{r.risk.level}</span>
                        </div>
                        <div className="truncate text-[11px] text-muted">{r.name} · {r.quote} · {fmtAge(r.ageHours)}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                      <div><div className="text-muted">Price</div><div className="font-mono text-white">${fmtPrice(r.price)}</div></div>
                      <div><div className="text-muted">24h</div><Pct v={r.change.h24} className="font-mono" /></div>
                      <div><div className="text-muted">Vol</div><div className="font-mono text-zinc-300">{fmtUsd(r.volume.h24)}</div></div>
                      <div><div className="text-muted">Liq</div><div className={`font-mono ${r.liquidity < 50_000 ? "text-rose-300" : "text-zinc-300"}`}>{fmtUsd(r.liquidity)}</div></div>
                    </div>
                    <div className="mt-2.5 flex h-1 overflow-hidden rounded-full bg-rose-400/70"><div className="bg-emerald-400" style={{ width: `${bp}%` }} /></div>
                    {r.signals.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {r.signals.map((s) => (
                          <span key={s} className={`rounded-md border px-1.5 py-0.5 text-[10px] ${toneCls[SIGNALS[s]?.tone ?? "neutral"]}`}>{SIGNALS[s]?.label ?? s}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                );
              })}
          {data && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">No tokens match this filter right now.</p>}
        </div>

        <div className="hidden overflow-x-auto rounded-2xl border border-line bg-panel md:block">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                {th("symbol", "Token")}
                {th("price", "Price", "text-right")}
                {th("h1", "1h", "text-right")}
                {th("h24", "24h", "text-right")}
                {th("volume", "Vol 24h", "text-right")}
                {th("liquidity", "Liquidity", "text-right")}
                {th("fdv", "FDV", "text-right")}
                <th className="px-3 py-2.5 font-normal">Buys / sells</th>
                {th("age", "Age", "text-right")}
                {th("risk", "Risk")}
                {th("signals", "Signals")}
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="border-b border-line/50">
                      <td colSpan={11} className="px-3 py-3"><div className="h-4 animate-pulse rounded bg-white/5" /></td>
                    </tr>
                  ))
                : rows.map((r) => {
                    const tot = r.txns.h24.buys + r.txns.h24.sells;
                    const bp = tot ? (r.txns.h24.buys / tot) * 100 : 50;
                    return (
                      <tr key={r.pool} className="border-b border-line/50 transition hover:bg-white/[0.03]">
                        <td className="px-3 py-2.5">
                          <Link href={`/app?pool=${r.pool}&interval=1h`} className="group flex items-center gap-2.5">
                            <TokenIcon t={r} size={26} />
                            <span>
                              <span className="flex items-center gap-1.5 font-medium text-white"><span className="group-hover:underline">{r.symbol}</span>{r.risk.flags.includes("copycat") && <span title={RISK_LABELS.copycat.hint} className="rounded border border-rose-400/40 bg-rose-400/10 px-1 text-[10px] font-normal text-rose-300">copycat?</span>}</span>
                              <span className="block max-w-[160px] truncate text-[11px] text-muted">{r.name} · {r.quote}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">${fmtPrice(r.price)}</td>
                        <td className="px-3 py-2.5 text-right"><Pct v={r.change.h1} /></td>
                        <td className="px-3 py-2.5 text-right"><Pct v={r.change.h24} /></td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-300">{fmtUsd(r.volume.h24)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.liquidity < 50_000 ? "text-rose-300" : "text-zinc-300"}`}>{fmtUsd(r.liquidity)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-400">{fmtUsd(r.fdv)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-rose-400/70"><div className="bg-emerald-400" style={{ width: `${bp}%` }} /></div>
                          <div className="mt-1 font-mono text-[10px] text-zinc-500">{r.txns.h24.buys} / {r.txns.h24.sells}</div>
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs ${r.ageHours != null && r.ageHours < 24 ? "text-amber" : "text-zinc-400"}`}>{fmtAge(r.ageHours)}</td>
                        <td className="px-3 py-2.5">
                          <span title={r.risk.flags.map((f) => RISK_LABELS[f]?.label ?? f).join(", ") || "No flags"} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${riskCls[r.risk.level]}`}>
                            {r.risk.level}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {r.signals.map((s) => (
                              <span key={s} title={SIGNALS[s]?.hint} className={`rounded-md border px-1.5 py-0.5 text-[11px] ${toneCls[SIGNALS[s]?.tone ?? "neutral"]}`}>
                                {SIGNALS[s]?.label ?? s}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              {data && rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-muted">No tokens match this filter right now.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted">
          Data: GeckoTerminal &amp; DexScreener (Robinhood Chain DEX pools). Signals are mechanical rules on on-chain stats — a starting point for research, not buy/sell calls.
          New and low-liquidity tokens can go to zero.
        </p>
      </main>
    </div>
  );
}
