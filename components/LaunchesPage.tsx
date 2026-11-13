"use client";

import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { TokenIcon, fmtPrice, fmtUsd, usePoll } from "./market-ui";
import type { Launch } from "@/lib/launches";

const tone = (g: string) =>
  g === "A" || g === "B" ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10" : g === "C" ? "text-amber border-amber/30 bg-amber/10" : "text-rose-300 border-rose-400/30 bg-rose-400/10";
const age = (h: number | null) => (h == null ? "–" : h < 1 / 60 ? "just now" : h < 1 ? `${Math.round(h * 60)}m ago` : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m ago`);

export function LaunchesPage() {
  const { data, error } = usePoll<{ launches: Launch[]; scannedAt: number }>("/api/launches", 60_000);
  const [hideCopies, setHideCopies] = useState(true);
  const [safeOnly, setSafeOnly] = useState(false);
  const all = data?.launches ?? [];
  const list = all.filter((l) => (!hideCopies || !l.token.copycatOf) && (!safeOnly || ["A", "B", "C"].includes(l.grade)));
  const bundled = all.filter((l) => l.reasons.some((r) => r.text.startsWith("Bundled launch"))).length;
  const copies = all.filter((l) => l.token.copycatOf).length;
  const failing = all.filter((l) => l.grade === "F" || l.grade === "D").length;

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-amber">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Live · every new pool
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Launch Scanner</h1>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Every token launched on Robinhood Chain in the last 24 hours, checked the moment it appears: admin powers in the contract, who bought in the first minute,
              copycats, fake liquidity and spoofed volume — rolled into an early grade.
            </p>
          </div>
          <div className="font-mono text-xs text-muted">{data ? `updated ${new Date(data.scannedAt).toISOString().slice(11, 16)} UTC · refreshes every minute` : "scanning…"}</div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["New launches", all.length, "text-white"],
            ["Grade D or F", failing, "text-rose-300"],
            ["Bundled launches", bundled, "text-rose-300"],
            ["Copycats", copies, "text-amber"],
          ].map(([k, v, c]) => (
            <div key={k as string} className="rounded-xl border border-line bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-wider text-muted">{k}</div>
              <div className={`mt-1 font-mono text-2xl ${c}`}>{data ? v : "…"}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-5 text-sm text-zinc-300">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={hideCopies} onChange={(e) => setHideCopies(e.target.checked)} className="accent-amber" /> Hide copycats</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} className="accent-amber" /> Only grades A–C</label>
          <span className="text-muted">{list.length} shown</span>
        </div>

        {error && !data && <p className="mt-8 text-rose-300">Couldn&apos;t load launches — retrying.</p>}
        {!data && !error && <div className="mt-6 grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div>}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {list.map((l) => {
            const t = l.token;
            return (
              <div key={t.pool} className="rounded-2xl border border-line bg-white/[0.02] p-5">
                <div className="flex items-start gap-4">
                  <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-2xl font-bold ${tone(l.grade)}`}>{l.grade}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TokenIcon t={t} size={20} />
                      <span className="truncate text-lg font-semibold">${t.symbol}</span>
                      <span className="truncate text-sm text-muted">{t.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-zinc-400">
                      <span>{age(t.ageHours)}</span>
                      <span>{fmtPrice(t.price)}</span>
                      <span>liq {t.fakeLiquidity ? "fake" : fmtUsd(t.liquidity)}</span>
                      <span>{t.txns.h24.buys}↑ {t.txns.h24.sells}↓</span>
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm text-zinc-400">{l.score}/100</div>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {l.reasons.slice(0, 4).map((r) => (
                    <li key={r.text} className={`flex gap-2 ${r.tone === "bad" ? "text-rose-300" : r.tone === "warn" ? "text-amber" : "text-emerald-300"}`}>
                      <span>{r.tone === "good" ? "✓" : r.tone === "bad" ? "✕" : "!"}</span>
                      <span>{r.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-3 text-xs">
                  <Link href={`/t/${t.pool}`} className="font-medium text-amber hover:underline">Full report & share ↗</Link>
                  <Link href={`/app?pool=${t.pool}`} className="text-zinc-300 hover:underline">Chart</Link>
                  <a href={`https://robinhoodchain.blockscout.com/token/${t.address}`} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-white">Explorer ↗</a>
                  <span className="ml-auto font-mono text-zinc-500">{t.address.slice(0, 6)}…{t.address.slice(-4)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-xs leading-relaxed text-muted">
          How it works: the contract is read straight from the chain (admin functions in the bytecode); &ldquo;first minute&rdquo; counts the wallets that received the token from the
          pool in its first 60 seconds and the share of total supply they took. A launch grade is an early warning built from on-chain data only — not a guarantee and not financial advice.
        </p>
      </main>
    </div>
  );
}
