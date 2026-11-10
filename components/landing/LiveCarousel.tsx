"use client";

import Link from "next/link";
import { useState } from "react";
import { Pct, TokenIcon, fmtPrice, fmtUsd, usePoll, type Overview } from "../market-ui";

/** Story-style carousel where every card is a live Robinhood Chain token. */
export function LiveCarousel() {
  const { data } = usePoll<Overview>("/api/overview", 60_000);
  const slides = data ? data.tokens.filter((t) => t.liquidity > 100_000).slice(0, 8) : [];
  const [i, setI] = useState(0);
  const t = slides.length ? slides[((i % slides.length) + slides.length) % slides.length] : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        {t ? (
          <Link href={`/app?pool=${t.pool}`} className="block">
            <div className="flex h-48 items-center justify-between gap-4 bg-[#e8ebea] px-8 text-[#111] sm:h-60 sm:px-12">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <TokenIcon t={t} size={44} />
                  <div className="truncate text-4xl font-semibold tracking-tight sm:text-6xl">{t.symbol}</div>
                </div>
                <div className="mt-3 font-mono text-xl tabular-nums sm:text-2xl">${fmtPrice(t.price)}</div>
              </div>
              <div className="hidden shrink-0 text-right font-mono text-sm text-[#555] sm:block">
                <div>Vol 24h <b className="text-[#111]">{fmtUsd(t.volume.h24)}</b></div>
                <div>Liquidity <b className="text-[#111]">{fmtUsd(t.liquidity)}</b></div>
                <div>FDV <b className="text-[#111]">{fmtUsd(t.fdv)}</b></div>
              </div>
            </div>
            <div className="px-6 py-6 sm:px-8">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#333] px-3 py-1 text-sm text-zinc-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {t.symbol} × Robinhood Chain
              </span>
              <p className="mt-4 text-xl leading-snug text-zinc-300 sm:text-2xl">
                {t.name} is <Pct v={t.change.h24} /> in 24h. Ask the agent — chart context, on-chain risk and whales in one click.
              </p>
            </div>
          </Link>
        ) : (
          <div className="h-[340px] animate-pulse bg-[#141414]" />
        )}
      </div>
      <div className="mt-6 flex justify-center gap-3">
        {["←", "→"].map((a, k) => (
          <button
            key={a}
            aria-label={k ? "Next token" : "Previous token"}
            onClick={() => setI((v) => (k ? v + 1 : v - 1))}
            className="grid h-12 w-12 place-items-center rounded-full border border-[#2a2a2a] bg-[#121212] text-xl text-zinc-300 transition hover:bg-[#1c1c1c] hover:text-white"
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}
