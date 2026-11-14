"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BubbleLink, BubbleMap, BubbleNode } from "@/lib/bubbles";

const W = 960, H = 600;
const COLORS = ["#ff9f43", "#7c5cff", "#ff6b9a", "#38bdf8", "#34d399", "#facc15", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf"];
export const REASON: Record<BubbleLink["kind"], string> = {
  transfer: "sent tokens to each other",
  same_source: "got tokens from the same wallet",
  same_tx: "received tokens in the same transaction",
  same_block: "bought in the same block at launch",
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pctFmt = (n: number) => (n >= 10 ? n.toFixed(1) : n >= 0.1 ? n.toFixed(2) : n.toFixed(3)) + "%";
const colorOf = (n: BubbleNode) => (n.cluster ? COLORS[(n.cluster - 1) % COLORS.length] : n.kind === "wallet" ? "#71717a" : "#3f3f46");

type P = BubbleNode & { x: number; y: number; r: number };

/** Small deterministic force layout: links pull, bubbles never overlap, everything stays in the box. */
function layout(map: BubbleMap): P[] {
  // bubbles together cover ~30% of the canvas; the biggest is capped so it can't swallow the map
  const total = map.nodes.reduce((s, n) => s + n.pct, 0) || 1;
  const max = Math.max(...map.nodes.map((n) => n.pct), 0.0001);
  const k = Math.min(Math.sqrt((0.3 * W * H) / (Math.PI * total)), 150 / Math.sqrt(max));
  const ps: P[] = map.nodes.map((n, i) => {
    const a = i * 2.39996, d = 30 + 13 * Math.sqrt(i) * 3;
    return { ...n, x: W / 2 + Math.cos(a) * d, y: H / 2 + Math.sin(a) * d, r: Math.max(7, Math.min(150, Math.sqrt(n.pct) * k)) };
  });
  const by = new Map(ps.map((p) => [p.address, p]));
  const links = map.links.map((l) => [by.get(l.a), by.get(l.b)]).filter((x): x is [P, P] => !!x[0] && !!x[1]);
  for (let it = 0; it < 420; it++) {
    const cool = 1 - it / 420;
    for (const p of ps) { p.x += (W / 2 - p.x) * 0.006 * cool; p.y += (H / 2 - p.y) * 0.009 * cool; }
    for (const [a, b] of links) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, want = a.r + b.r + 14;
      const f = ((d - want) / d) * 0.06;
      a.x += dx * f; a.y += dy * f; b.x -= dx * f; b.y -= dy * f;
    }
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 4;
        if (d < min) { const f = ((min - d) / d) * 0.5; a.x -= dx * f; a.y -= dy * f; b.x += dx * f; b.y += dy * f; }
      }
    for (const p of ps) { p.x = Math.max(p.r + 2, Math.min(W - p.r - 2, p.x)); p.y = Math.max(p.r + 2, Math.min(H - p.r - 2, p.y)); }
  }
  return ps;
}

export function verdictOf(m: BubbleMap) {
  const c = m.summary.topClusterPct, w = m.summary.topWalletPct ?? 0;
  if (w >= 20 && w >= c) return { tone: "bad" as const, text: `One wallet holds ${pctFmt(w)} of the supply on its own` };
  if (c >= 20) return { tone: "bad" as const, text: `One group of linked wallets holds ${pctFmt(c)} of the supply` };
  if (c >= 8) return { tone: "warn" as const, text: `A group of linked wallets holds ${pctFmt(c)} of the supply` };
  if (w >= 8) return { tone: "warn" as const, text: `The biggest single wallet holds ${pctFmt(w)} of the supply` };
  return { tone: "good" as const, text: m.clusters.length ? `Linked wallets are small — the biggest group holds ${pctFmt(c)}` : "No linked wallets among the top holders" };
}

export function HolderMap({ token, compact = false }: { token: string; compact?: boolean }) {
  const [m, setM] = useState<BubbleMap | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<P | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    let stop = false;
    setM(null); setErr(null);
    fetch(`/api/bubbles?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => { if (!stop) (j.error ? setErr(j.error) : setM(j)); })
      .catch(() => !stop && setErr("Couldn't load the holder map"));
    return () => { stop = true; };
  }, [token]);

  const ps = useMemo(() => (m ? layout(m) : []), [m]);
  const pos = useMemo(() => new Map(ps.map((p) => [p.address, p])), [ps]);

  if (err) return <div className="rounded-2xl border border-line bg-white/[0.02] p-6 text-sm text-muted">Holder map unavailable: {err}</div>;
  if (!m)
    return (
      <div className="grid h-[420px] place-items-center rounded-2xl border border-line bg-white/[0.02] text-center text-sm text-muted">
        <div>
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-amber" />
          Mapping holders from the chain…
          <div className="mt-1 text-xs">Reads every transfer it can — up to ~30s for big tokens.</div>
        </div>
      </div>
    );

  const v = verdictOf(m);
  const dim = (n: BubbleNode) => focus != null && n.cluster !== focus;
  const tone = { bad: "border-rose-400/30 bg-rose-400/[0.06] text-rose-200", warn: "border-amber/30 bg-amber/[0.06] text-amber", good: "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200" }[v.tone];

  return (
    <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-[1fr_320px]"}`}>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-[radial-gradient(ellipse_at_center,#ffffff08,transparent_70%)]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" onMouseLeave={() => setHover(null)}>
          {m.links.map((l, i) => {
            const a = pos.get(l.a), b = pos.get(l.b);
            if (!a || !b) return null;
            const off = focus != null && a.cluster !== focus;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorOf(a)} strokeOpacity={off ? 0.08 : 0.55} strokeWidth={1.6} />;
          })}
          {ps.map((p) => {
            const c = colorOf(p);
            const isContract = p.kind !== "wallet";
            return (
              <g key={p.address} opacity={dim(p) ? 0.18 : 1} style={{ cursor: "pointer" }} onMouseEnter={() => setHover(p)} onClick={() => p.cluster && setFocus(focus === p.cluster ? null : p.cluster)}>
                <circle cx={p.x} cy={p.y} r={p.r} fill={c} fillOpacity={isContract ? 0.12 : 0.28} stroke={c} strokeWidth={hover?.address === p.address ? 3 : 1.5} strokeDasharray={isContract ? "4 4" : undefined} />
                {p.r >= 22 && (
                  <text x={p.x} y={p.y + (p.label && p.r >= 34 ? -4 : 5)} textAnchor="middle" fontSize={Math.min(20, p.r / 2.4)} fill="#f4f4f5" fontFamily="var(--font-geist-mono)">{pctFmt(p.pct)}</text>
                )}
                {p.label && p.r >= 34 && <text x={p.x} y={p.y + 16} textAnchor="middle" fontSize={11} fill="#a1a1aa">{p.label}</text>}
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/15 bg-[#0d0d10]/95 px-3 py-2 text-xs shadow-xl">
            <div className="font-mono text-zinc-200">{short(hover.address)}</div>
            <div className="mt-0.5 text-muted">
              {pctFmt(hover.pct)} of supply · {hover.label ?? (hover.kind === "wallet" ? (hover.cluster ? `cluster ${hover.cluster}` : "not linked") : "contract")}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-muted">
          <span>Top {m.nodes.length} holders · bubble size = share of supply</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-zinc-500" /> pool / contract</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-zinc-500/60" /> wallet, not linked</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-amber" /> colored = linked group</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className={`rounded-2xl border p-4 text-sm ${tone}`}>{v.text}</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["Linked wallets", pctFmt(m.summary.clusteredPct)],
            ["Biggest wallet", pctFmt(m.summary.topWalletPct ?? 0)],
            ["Pools & contracts", pctFmt(m.summary.contractsPct)],
            ["Burned", pctFmt(m.summary.burnedPct)],
          ].map(([k, val]) => (
            <div key={k} className="rounded-xl border border-line bg-white/[0.02] p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">{k}</div>
              <div className="mt-0.5 font-mono">{val}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-line bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] uppercase tracking-wider text-muted">
            <span>Linked groups</span>
            {focus != null && <button type="button" onClick={() => setFocus(null)} className="normal-case tracking-normal text-amber hover:underline">Show all</button>}
          </div>
          {!m.clusters.length ? (
            <p className="px-1 pb-1 text-sm text-muted">None found — no top holders sent each other tokens, shared a funding wallet or bought together.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {m.clusters.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setFocus(focus === c.id ? null : c.id)} className={`w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white/5 ${focus === c.id ? "bg-white/[0.07]" : ""}`}>
                    <span className="flex items-center gap-2">
                      <i className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: COLORS[(c.id - 1) % COLORS.length] }} />
                      <span className="flex-1">{c.wallets.length} wallets</span>
                      <span className="font-mono">{pctFmt(c.pct)}</span>
                    </span>
                    <span className="mt-0.5 block pl-[18px] text-xs text-muted">{c.reasons.map((r) => REASON[r]).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {focus != null && (
          <div className="rounded-2xl border border-line bg-white/[0.02] p-3 text-xs">
            <div className="mb-1 text-muted">Wallets in this group</div>
            {m.clusters.find((c) => c.id === focus)?.wallets.map((w) => (
              <Link key={w} href={`/wallet?address=${w}`} className="flex justify-between py-0.5 font-mono text-zinc-300 hover:text-white">
                <span>{short(w)}</span>
                <span>{pctFmt(m.nodes.find((n) => n.address === w)?.pct ?? 0)}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          {m.coverage.complete
            ? `Built from every transfer since launch (${m.coverage.transfers.toLocaleString("en-US")}).`
            : `Built from every transfer in the last ${m.coverage.hours}h plus ${m.coverage.samples} older windows back to launch (${m.coverage.transfers.toLocaleString("en-US")} transfers). Holders who never moved in those windows can be missing.`}{" "}
          Balances are live. Links show on-chain relationships, not proof of one owner.
        </p>
      </div>
    </div>
  );
}
