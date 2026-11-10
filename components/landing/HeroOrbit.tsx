"use client";

import Link from "next/link";
import { Logo } from "../Logo";
import { Pct, TokenIcon, usePoll, type Overview, type Token } from "../market-ui";

type Ring = { size: number; duration: number; reverse?: boolean; tokens: Token[]; iconSize: number };

/** Same orbit at any size: the layout box shrinks with it (480px at scale 1). */
export function ScaledOrbit({ scale, className = "" }: { scale: number; className?: string }) {
  return (
    <div className={className} style={{ width: 480 * scale, height: 480 * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <HeroOrbit />
      </div>
    </div>
  );
}

/** Rotating rings with live Robinhood Chain tokens orbiting the Strix owl. */
export function HeroOrbit() {
  const { data } = usePoll<Overview>("/api/overview", 60_000);
  // one token per distinct logo (tokenized stocks share the same icon), so the orbit looks varied
  const seen = new Set<string>();
  let stocks = 0;
  const list = (data?.tokens ?? [])
    .filter((t) => {
      if (!t.image || seen.has(t.image)) return false;
      if (/robinhood token|etf|fund|trust/i.test(t.name) && stocks++ >= 1) return false;
      seen.add(t.image);
      return true;
    })
    .slice(0, 11);
  const rings: Ring[] = [
    { size: 220, duration: 22, tokens: list.slice(0, 3), iconSize: 34 },
    { size: 340, duration: 34, reverse: true, tokens: list.slice(3, 7), iconSize: 38 },
    { size: 460, duration: 48, tokens: list.slice(7, 11), iconSize: 32 },
  ];

  return (
    <div className="relative h-[480px] w-[480px]" aria-hidden={!data}>
      {/* glow */}
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.08),transparent_70%)]" />
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[radial-gradient(closest-side,rgb(124_196_255/0.25),rgb(228_143_208/0.12)_60%,transparent)] blur-xl" />

      {rings.map((r, ri) => (
        <div
          key={ri}
          className="absolute left-1/2 top-1/2"
          style={{ width: r.size, height: r.size, marginLeft: -r.size / 2, marginTop: -r.size / 2 }}
        >
          {/* the ring line */}
          <div className={`absolute inset-0 rounded-full border ${ri === 1 ? "border-dashed border-white/15" : "border-white/10"}`} />
          {/* rotating layer */}
          <div
            className="absolute inset-0"
            style={{ animation: `spin ${r.duration}s linear infinite${r.reverse ? " reverse" : ""}` }}
          >
            {/* a small light travelling on the ring */}
            <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_3px_rgba(255,255,255,0.6)]" />
            {r.tokens.map((t, i) => {
              const angle = (360 / Math.max(r.tokens.length, 1)) * i + ri * 25;
              return (
                <div
                  key={t.pool}
                  className="absolute left-1/2 top-1/2"
                  style={{ transform: `rotate(${angle}deg) translateY(-${r.size / 2}px) rotate(-${angle}deg)` }}
                >
                  {/* counter-rotate so icons stay upright while the ring spins */}
                  <div
                    className="-translate-x-1/2 -translate-y-1/2"
                    style={{ animation: `spin ${r.duration}s linear infinite${r.reverse ? "" : " reverse"}` }}
                  >
                    <Link
                      href={`/app?pool=${t.pool}`}
                      className="group pointer-events-auto relative flex flex-col items-center"
                      title={`${t.symbol} · open in the analyst`}
                    >
                      <span className="rounded-full p-[3px] ring-1 ring-white/15 transition group-hover:scale-110 group-hover:ring-white/50" style={{ background: "rgba(20,20,20,0.9)" }}>
                        <TokenIcon t={t} size={r.iconSize} />
                      </span>
                      <span className="mt-1 whitespace-nowrap rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 opacity-0 transition group-hover:opacity-100">
                        {t.symbol} <Pct v={t.change.h24} />
                      </span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* center */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="grid h-24 w-24 animate-float place-items-center rounded-[28px] shadow-[0_0_60px_-10px_rgba(124,196,255,0.45)]"
          style={{
            border: "1.5px solid transparent",
            background: "linear-gradient(180deg,#1d1d1d,#0d0d0d) padding-box, linear-gradient(135deg,#f2c46d,#e48fd0 50%,#7cc4ff) border-box",
          }}
        >
          <Logo className="h-12 w-12" mono />
        </div>
        <div className="mt-3 text-center font-mono text-[11px] text-zinc-500">chain 4663</div>
      </div>
    </div>
  );
}
