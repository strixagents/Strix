"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NeuralBrain } from "../NeuralBrain";
import { Sparkline, TokenIcon, fmtPrice, fmtUsd, riskCls } from "../market-ui";
import { store, useStore, type WatchItem } from "../store";
import { COMMANDS } from "../commands";

type Step = { id: string; name?: string; label: string; done?: boolean; ok?: boolean; summary?: string };
type Card =
  | { kind: "token"; symbol: string; name: string; image: string | null; pool: string; price: number; h1: number; h24: number; liquidity: number; volume24h: number; fdv: number | null; risk: string; flags: string[]; bias: string | null; rsi: number | null; interval: string; spark: number[] }
  | { kind: "score"; symbol: string; pool: string; grade: string; score: number; verdict: string; checks: { label: string; status: string }[]; honeypot: string; holders: number | null }
  | { kind: "whales"; symbol: string; pool: string; pressure: string; buysUsd: number; sellsUsd: number; wallets: number; wash: boolean; topWallet: string | null }
  | { kind: "wallet"; address: string; valueUsd: number; tokens: number; trades: number; bot: boolean; top: { symbol: string; valueUsd: number }[] }
  | { kind: "radar"; watching: number; events: { symbol: string; title: string; severity: string; pool: string }[] }
  | { kind: "traders"; windowHours: number; top: { wallet: string; pnlUsd: number; volumeUsd: number; automated: boolean }[] }
  | { kind: "action"; icon: string; text: string; href?: string }
  | { kind: "contract"; symbol: string; address: string; verdict: string; sizeBytes: number; owner: string; proxy: string | null; findings: { label: string; severity: string; detail: string }[]; note: string }
  | { kind: "watchlist"; items: { symbol: string; pool: string; price: number; h24: number; liquidity: number; risk: string }[]; alerts: { symbol: string; price: number; dir: string; distancePct: number | null }[]; wallets: number }
  | { kind: "compare"; rows: { symbol: string; pool: string; price: number; h24: number; liquidity: number; volume24h: number; fdv: number | null; ageDays: number | null; risk: string; flags: string[] }[] };
type Action =
  | { kind: "alert"; pool: string; symbol: string; price: number; dir: "above" | "below" }
  | { kind: "watch"; op: "add" | "remove"; pool: string; symbol: string }
  | { kind: "follow"; op: "add" | "remove"; address: string; label: string };
type Meta = { model: string; ms: number; tools: number };
/** Downscale a screenshot in the browser: a ~1600px JPEG for the vision model and a small thumbnail for the chat. */
async function shrinkImage(file: File): Promise<{ full: string; thumb: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const draw = (max: number, q: number) => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", q);
    };
    return { full: draw(1600, 0.86), thumb: draw(240, 0.7) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Msg = {
  role: "user" | "assistant"; content: string; image?: string; steps?: Step[]; cards?: Card[]; followups?: string[]; meta?: Meta;
  pending?: boolean; streaming?: boolean; error?: string; stopped?: boolean;
};

const STORE = "strix.chat.v1";
const SUGGESTIONS = [
  "How is Robinhood Chain doing today?",
  "Any rugs or copycats on the radar right now?",
  "Who are the top traders today (bots removed)?",
  "Is PONS safe? Check holders & rug risk",
  "Are whales accumulating CASHCAT?",
  "Which new launches look risky right now?",
  "Compare PONS vs CASHCAT",
];



const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(n))}`;
const pct = (n: number) => (
  <span className={n >= 0 ? "text-emerald-400" : "text-rose-400"}>
    {n >= 0 ? "+" : ""}
    {Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)}%
  </span>
);

function expand(text: string, current: string): string | null {
  const m = text.trim().match(/^(\/\w+)\s*(.*)$/s);
  if (!m) return text.trim();
  const c = COMMANDS.find((x) => x.cmd === m[1].toLowerCase());
  if (!c) return text.trim();
  const arg = m[2].trim() || (c.arg === "token" ? current : "");
  if (!arg && c.arg && c.arg !== "ticker") return null;
  return c.build(arg);
}

function applyAction(a: Action) {
  if (a.kind === "alert") store.addAlert({ pool: a.pool, symbol: a.symbol, price: a.price, dir: a.dir });
  else if (a.kind === "watch") (a.op === "add" ? store.addWatch({ pool: a.pool, symbol: a.symbol }) : store.removeWatch(a.pool));
  else a.op === "add" ? store.follow({ address: a.address, label: a.label }) : store.unfollow(a.address);
}

/* ───────────── voice input (browser speech recognition, free) ───────────── */

type SR = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
function MicButton({ onText }: { onText: (t: string, final: boolean) => void }) {
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!ok) return null;
  const toggle = () => {
    if (on) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const R = (w.SpeechRecognition || w.webkitSpeechRecognition)!;
    const r = new R();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const res = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>);
      onText(res.map((x) => x[0].transcript).join(" "), !!res.at(-1)?.isFinal);
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <button type="button" onClick={toggle} title={on ? "Stop listening" : "Speak your question"} aria-label="Voice input"
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition ${on ? "animate-pulse border-rose-400/50 bg-rose-400/15 text-rose-200" : "border-line text-zinc-400 hover:text-white"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
    </button>
  );
}

/* ───────────── data cards ───────────── */

function CardView({ c, onFocus }: { c: Card; onFocus: (pool: string, interval: string) => void }) {
  const box = "rounded-xl border border-line bg-white/[0.02] p-3 text-xs animate-fade-up";
  if (c.kind === "token")
    return (
      <button onClick={() => onFocus(c.pool, c.interval)} className={`${box} block w-full text-left transition hover:border-white/20`}>
        <div className="flex items-center gap-2.5">
          <TokenIcon t={c} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">{c.symbol}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${riskCls[c.risk as keyof typeof riskCls] ?? "bg-white/5 text-muted"}`}>{c.risk} risk</span>
              {c.bias && <span className="truncate text-[10px] text-muted">{c.bias}</span>}
            </div>
            <div className="font-mono text-[11px] text-zinc-400">
              ${fmtPrice(c.price)} · 1h {pct(c.h1)} · 24h {pct(c.h24)}
            </div>
          </div>
          <Sparkline data={c.spark} up={(c.spark.at(-1) ?? 0) >= (c.spark[0] ?? 0)} className="h-9 w-20 shrink-0" />
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1 font-mono text-[10px]">
          <div><div className="text-muted">Liquidity</div><div className="text-zinc-200">{fmtUsd(c.liquidity)}</div></div>
          <div><div className="text-muted">Vol 24h</div><div className="text-zinc-200">{fmtUsd(c.volume24h)}</div></div>
          <div><div className="text-muted">FDV</div><div className="text-zinc-200">{fmtUsd(c.fdv)}</div></div>
          <div><div className="text-muted">RSI {c.interval}</div><div className="text-zinc-200">{c.rsi != null ? c.rsi.toFixed(1) : "–"}</div></div>
        </div>
        {!!c.flags.length && <div className="mt-2 flex flex-wrap gap-1">{c.flags.slice(0, 4).map((f) => <span key={f} className="rounded border border-rose-400/25 px-1.5 py-0.5 text-[10px] text-rose-300">{f}</span>)}</div>}
      </button>
    );
  if (c.kind === "score") {
    const tone = c.grade === "A" || c.grade === "B" ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10" : c.grade === "C" ? "text-amber border-amber/30 bg-amber/10" : "text-rose-300 border-rose-400/30 bg-rose-400/10";
    const bad = c.checks.filter((x) => x.status === "fail" || x.status === "warn");
    return (
      <div className={box}>
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-xl font-bold ${tone}`}>{c.grade}</div>
          <div className="min-w-0">
            <div className="font-semibold text-white">{c.symbol} safety · {c.score}/100</div>
            <div className="text-zinc-400">{c.verdict}</div>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div className={`h-full rounded-full ${c.score >= 70 ? "bg-emerald-400" : c.score >= 55 ? "bg-amber" : "bg-rose-400"}`} style={{ width: `${c.score}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-zinc-300">honeypot: {c.honeypot}</span>
          {c.holders != null && <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-zinc-300">{c.holders.toLocaleString("en-US")} holders</span>}
          {bad.slice(0, 4).map((x) => (
            <span key={x.label} className={`rounded border px-1.5 py-0.5 text-[10px] ${x.status === "fail" ? "border-rose-400/30 text-rose-300" : "border-amber/30 text-amber"}`}>
              {x.status === "fail" ? "✕" : "!"} {x.label}
            </span>
          ))}
          {!bad.length && <span className="rounded border border-emerald-400/30 px-1.5 py-0.5 text-[10px] text-emerald-300">✓ all checks passed</span>}
        </div>
        <Link href={`/t/${c.pool}`} className="mt-2.5 inline-block text-[11px] font-medium text-amber hover:underline">Full report & share ↗</Link>
      </div>
    );
  }
  if (c.kind === "whales") {
    const tot = c.buysUsd + c.sellsUsd || 1;
    return (
      <div className={box}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">🐋 {c.symbol} whales</span>
          <span className="text-zinc-400">{c.pressure} · {c.wallets} wallets</span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full">
          <div className="bg-emerald-400" style={{ width: `${(c.buysUsd / tot) * 100}%` }} />
          <div className="flex-1 bg-rose-400" />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px]">
          <span className="text-emerald-300">bought {fmtUsd(c.buysUsd)}</span>
          <span className="text-rose-300">sold {fmtUsd(c.sellsUsd)}</span>
        </div>
        {c.wash && <div className="mt-2 rounded bg-rose-400/10 px-2 py-1 text-rose-300">⚠ Likely wash trading — one wallet dominates</div>}
        {c.topWallet && <Link href={`/wallet?address=${c.topWallet}`} className="mt-2 inline-block font-mono text-[10px] text-zinc-400 hover:text-white">top accumulator {short(c.topWallet)} →</Link>}
      </div>
    );
  }
  if (c.kind === "wallet")
    return (
      <Link href={`/wallet?address=${c.address}`} className={`${box} block transition hover:border-white/20`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-white">{short(c.address)}</span>
          {c.bot && <span className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] text-amber">BOT / RELAYER</span>}
          <span className="ml-auto font-mono text-sm text-white">{fmtUsd(c.valueUsd)}</span>
        </div>
        <div className="mt-1 text-zinc-400">{c.tokens} tokens · {c.trades} trades in 24h</div>
        <div className="mt-2 flex flex-wrap gap-1">{c.top.map((h) => <span key={h.symbol} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{h.symbol} {fmtUsd(h.valueUsd)}</span>)}</div>
      </Link>
    );
  if (c.kind === "radar")
    return (
      <div className={box}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />Rug Radar</span>
          <Link href="/radar" className="text-zinc-400 hover:text-white">watching {c.watching} pools →</Link>
        </div>
        <ul className="mt-2 space-y-1">
          {c.events.length ? c.events.map((e, i) => (
            <li key={i}>
              <button onClick={() => onFocus(e.pool, "1h")} className="flex w-full gap-2 text-left hover:text-white">
                <span className={e.severity === "high" ? "text-rose-400" : "text-amber"}>●</span>
                <span className="font-semibold text-zinc-200">{e.symbol}</span>
                <span className="truncate text-zinc-400">{e.title}</span>
              </button>
            </li>
          )) : <li className="text-zinc-400">No red-flag events right now.</li>}
        </ul>
      </div>
    );
  if (c.kind === "contract") {
    const V: Record<string, [string, string]> = {
      danger: ["🔴 Dangerous admin powers", "border-rose-400/40 bg-rose-400/[0.06] text-rose-200"],
      caution: ["🟠 Some admin powers", "border-amber/40 bg-amber/[0.06] text-amber"],
      clean: ["🟢 No admin powers found", "border-emerald-400/30 bg-emerald-400/[0.05] text-emerald-200"],
      issuer: ["🏛 Issuer-managed asset", "border-sky-400/30 bg-sky-400/[0.05] text-sky-200"],
    };
    const [title, cls] = V[c.verdict] ?? ["Contract", "border-line text-zinc-200"];
    return (
      <div className={`animate-fade-up rounded-xl border p-3 text-xs ${cls}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Contract X-ray · {c.symbol}</span>
          <span>{title}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400">
          <a href={`https://robinhoodchain.blockscout.com/address/${c.address}`} target="_blank" rel="noreferrer" className="hover:text-white">{short(c.address)} ↗</a>
          <span>owner: {c.owner === "none" || c.owner === "renounced" || c.owner === "admin roles" ? c.owner : short(c.owner)}</span>
          {c.proxy && <span>proxy: {c.proxy.replace(/0x[0-9a-f]{40}/i, (m) => short(m))}</span>}
          <span>{c.sizeBytes.toLocaleString("en-US")} bytes</span>
        </div>
        <ul className="mt-2 space-y-1">
          {c.findings.map((f) => (
            <li key={f.label} className="flex gap-2 text-zinc-300">
              <span className={f.severity === "high" ? "text-rose-400" : f.severity === "medium" ? "text-amber" : "text-zinc-500"}>{f.severity === "high" ? "✕" : f.severity === "medium" ? "!" : "·"}</span>
              <span><b className="font-medium text-zinc-100">{f.label}</b> — {f.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (c.kind === "action")
    return (
      <div className="flex animate-fade-up items-center gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.07] px-3 py-2.5 text-xs text-emerald-100">
        <span className="text-base">{c.icon}</span>
        <span className="flex-1">{c.text}</span>
        {c.href && <Link href={c.href} className="text-emerald-300/80 hover:text-white">open →</Link>}
      </div>
    );
  if (c.kind === "watchlist")
    return (
      <div className={box}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">⭐ Your watchlist</span>
          <span className="text-zinc-400">{c.alerts.length} alerts · {c.wallets} wallets</span>
        </div>
        {c.items.length ? (
          <ul className="mt-2 space-y-1 font-mono text-[11px]">
            {c.items.map((t) => (
              <li key={t.pool}>
                <button onClick={() => onFocus(t.pool, "1h")} className="flex w-full items-center gap-2 text-left hover:text-white">
                  <span className="w-20 truncate font-semibold text-zinc-200">{t.symbol}</span>
                  <span className="text-zinc-400">${fmtPrice(t.price)}</span>
                  <span className="ml-auto">{pct(t.h24)}</span>
                  <span className={`rounded px-1 text-[10px] ${riskCls[t.risk as keyof typeof riskCls] ?? ""}`}>{t.risk}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-1 text-zinc-400">Empty — try “/watch PONS”.</div>
        )}
        {!!c.alerts.length && (
          <div className="mt-2 flex flex-wrap gap-1">
            {c.alerts.map((a, i) => (
              <span key={i} className="rounded border border-amber/30 px-1.5 py-0.5 font-mono text-[10px] text-amber">
                🔔 {a.symbol} {a.dir === "above" ? "≥" : "≤"} ${fmtPrice(a.price)}{a.distancePct != null ? ` (${a.distancePct >= 0 ? "+" : ""}${a.distancePct.toFixed(1)}%)` : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  if (c.kind === "compare")
    return (
      <div className={`${box} overflow-x-auto`}>
        <table className="w-full min-w-[420px] font-mono text-[11px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-1.5 font-normal">Token</th><th className="pb-1.5 font-normal">Price</th><th className="pb-1.5 font-normal">24h</th>
              <th className="pb-1.5 font-normal">Liquidity</th><th className="pb-1.5 font-normal">Vol 24h</th><th className="pb-1.5 font-normal">Age</th><th className="pb-1.5 font-normal">Risk</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.pool} className="border-t border-line">
                <td className="py-1.5"><button onClick={() => onFocus(r.pool, "1h")} className="font-semibold text-white hover:underline">{r.symbol}</button></td>
                <td className="text-zinc-300">${fmtPrice(r.price)}</td>
                <td>{pct(r.h24)}</td>
                <td className="text-zinc-300">{fmtUsd(r.liquidity)}</td>
                <td className="text-zinc-300">{fmtUsd(r.volume24h)}</td>
                <td className="text-zinc-300">{r.ageDays != null ? `${r.ageDays}d` : "–"}</td>
                <td><span className={`rounded px-1 ${riskCls[r.risk as keyof typeof riskCls] ?? ""}`}>{r.risk}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">Top traders · ~{c.windowHours}h</span>
        <Link href="/smart-money" className="text-zinc-400 hover:text-white">leaderboard →</Link>
      </div>
      <ol className="mt-2 space-y-1 font-mono text-[11px]">
        {c.top.map((t, i) => (
          <li key={t.wallet} className="flex items-center gap-2">
            <span className="w-3 text-muted">{i + 1}</span>
            <Link href={`/wallet?address=${t.wallet}`} className="text-zinc-200 hover:underline">{short(t.wallet)}</Link>
            {t.automated && <span className="text-[9px] text-amber">AUTO</span>}
            <span className="ml-auto text-muted">{fmtUsd(t.volumeUsd)}</span>
            <span className={t.pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}>{signed(t.pnlUsd)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ───────────── message ───────────── */

const Answer = memo(function Answer({ text }: { text: string }) {
  return (
    <div className="prose-strix text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]} components={{ a: ({ href, children }) => <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{children}</a> }}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

function Steps({ steps, done, meta }: { steps: Step[]; done: boolean; meta?: Meta }) {
  const [open, setOpen] = useState(false);
  const tools = steps.filter((s) => s.name !== "wait" && s.name !== "switch");
  if (done && !open)
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-300">
        <span className="text-emerald-400">✓</span>
        Used {tools.length} live tool{tools.length === 1 ? "" : "s"}
        {meta ? ` · ${(meta.ms / 1000).toFixed(1)}s · ${meta.model}` : ""}
        <span aria-hidden>▾</span>
      </button>
    );
  return (
    <ul className="space-y-1.5 border-l border-line pl-3 font-mono text-[11px]" onClick={() => done && setOpen(false)}>
      {steps.map((s) => (
        <li key={s.id} className="flex animate-fade-up gap-2">
          <span className={!s.done ? "animate-pulse text-amber" : s.ok ? "text-emerald-400" : "text-rose-400"}>{!s.done ? "◐" : s.ok ? "✓" : "✕"}</span>
          <span className="text-zinc-400">
            {s.label}
            {s.summary && <span className="block text-zinc-500">→ {s.summary}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ───────────── chat ───────────── */

export function AgentChat({
  onFocus: focusChart, current = "", page = false,
}: { onFocus?: (pool: string, interval: string) => void; current?: string; page?: boolean }) {
  const router = useRouter();
  // in the terminal a card moves the chart; on the standalone agent page it opens the analyst
  const onFocus = (pool: string, interval: string) => (focusChart ? focusChart(pool, interval) : router.push(`/app?pool=${pool}`));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const watch = useStore<WatchItem[]>(store.watch, []);
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<boolean | null>(null);
  const [toolCount, setToolCount] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [cmdIdx, setCmdIdx] = useState(0);
  const [image, setImage] = useState<{ full: string; thumb: string } | null>(null);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const attach = async (f: File) => {
    setImgErr(null);
    if (f.size > 15 * 1024 * 1024) return setImgErr("Image is too large (max 15 MB).");
    try {
      setImage(await shrinkImage(f));
      ta.current?.focus();
    } catch {
      setImgErr("Couldn't read that image — try a PNG or JPG screenshot.");
    }
  };
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const stick = useRef(true);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((j) => {
      setLlm(j.llm);
      setToolCount(j.tools ?? null);
    }).catch(() => setLlm(false));
    let saved: Msg[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "[]") as Msg[];
      if (Array.isArray(raw)) saved = raw.filter((m) => !m.pending && !m.streaming);
      if (saved.length) setMsgs(saved);
    } catch {}
    // /agent?q=… (links like "Ask Strix about PONS") — send it right away, then clean the URL
    if (page) {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) {
        window.history.replaceState(null, "", window.location.pathname);
        send(q.slice(0, 500), saved);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (busy) return;
    try {
      localStorage.setItem(STORE, JSON.stringify(msgs.slice(-30)));
    } catch {}
  }, [msgs, busy]);

  // follow the stream unless the user scrolled up to read
  useEffect(() => {
    const el = scroller.current;
    if (el && msgs.length && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // auto-grow the input
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  const cmdMatches = useMemo(() => {
    if (!input.startsWith("/") || input.includes(" ")) return [];
    return COMMANDS.filter((c) => c.cmd.startsWith(input.toLowerCase()));
  }, [input]);

  const send = async (raw: string, base?: Msg[]) => {
    const pic = base ? null : image; // retries are text-only
    if ((!raw.trim() && !pic) || busy) return;
    const text = raw.trim() ? expand(raw, current) : "What is in this image? Check every token, address and claim in it against live on-chain data.";
    if (text == null) {
      // command needs a token / address the user hasn't typed yet
      setInput(`${raw.trim().split(/\s+/)[0]} `);
      ta.current?.focus();
      return;
    }
    const prior = (base ?? msgs).filter((m) => !m.error);
    const history = [...prior, { role: "user" as const, content: text, ...(pic ? { image: pic.thumb } : {}) }];
    setMsgs([...history, { role: "assistant", content: "", steps: [], cards: [], pending: true }]);
    setInput("");
    setImage(null);
    setBusy(true);
    stick.current = true;
    const ctrl = new AbortController();
    abort.current = ctrl;

    const patch = (fn: (m: Msg) => Msg) =>
      setMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = fn(copy[copy.length - 1]);
        return copy;
      });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: "web", viewing: current, watchlist: store.watch(), wallets: store.followed(), alerts: store.alerts(),
          ...(pic ? { image: pic.full } : {}),
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let pendingDelta = "";
      let raf = 0;
      const flush = () => {
        raf = 0;
        if (!pendingDelta) return;
        const d = pendingDelta;
        pendingDelta = "";
        patch((m) => ({ ...m, content: m.content + d, streaming: true }));
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === "delta") {
            pendingDelta += e.text;
            if (!raf) raf = requestAnimationFrame(flush);
            continue;
          }
          if (pendingDelta) flush();
          if (e.t === "step") patch((m) => ({ ...m, steps: [...(m.steps ?? []), { id: e.id, name: e.name, label: e.label }] }));
          else if (e.t === "step_done") patch((m) => ({ ...m, steps: m.steps?.map((s) => (s.id === e.id ? { ...s, done: true, ok: e.ok, summary: e.summary } : s)) }));
          else if (e.t === "card") patch((m) => ({ ...m, cards: [...(m.cards ?? []).filter((c) => !(c.kind === e.card.kind && "symbol" in c && c.symbol === e.card.symbol)), e.card] }));
          else if (e.t === "focus") focusChart?.(e.pool, e.interval);
          else if (e.t === "reset") patch((m) => ({ ...m, content: "", streaming: false }));
          else if (e.t === "answer") patch((m) => ({ ...m, content: e.text, pending: false, streaming: false }));
          else if (e.t === "followups") patch((m) => ({ ...m, followups: e.items }));
          else if (e.t === "action") applyAction(e.action as Action);
          else if (e.t === "meta") patch((m) => ({ ...m, meta: e }));
          else if (e.t === "error") patch((m) => ({ ...m, steps: [...(m.steps ?? []), { id: `err${Date.now()}`, name: "switch", label: "AI provider error — falling back", done: true, ok: false, summary: String(e.message).slice(0, 120) }] }));
        }
      }
      if (raf) cancelAnimationFrame(raf);
      flush();
      patch((m) => ({ ...m, pending: false, streaming: false, steps: m.steps?.map((s) => ({ ...s, done: true, ok: s.ok ?? true })) }));
    } catch (e) {
      if ((e as Error).name === "AbortError")
        patch((m) => ({ ...m, pending: false, streaming: false, stopped: true, content: m.content || "_Stopped._", steps: m.steps?.map((s) => (s.done ? s : { ...s, done: true, ok: false, summary: "stopped" })) }));
      else patch((m) => ({ ...m, pending: false, streaming: false, error: (e as Error).message }));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const retry = (i: number) => {
    const userIdx = i - 1;
    if (msgs[userIdx]?.role !== "user") return;
    send(msgs[userIdx].content, msgs.slice(0, userIdx));
  };

  const copy = async (i: number) => {
    try {
      await navigator.clipboard.writeText(msgs[i].content);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const pickCmd = (c: (typeof COMMANDS)[number]) => {
    setInput(c.arg ? `${c.cmd} ` : c.cmd);
    ta.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={`h-2 w-2 rounded-full bg-amber ${busy ? "animate-ping" : "animate-pulse"}`} /> Strix Agent
          {current && <span className="hidden font-mono text-[10px] text-muted sm:inline">· viewing {current}</span>}
        </div>
        <div className="flex items-center gap-2">
          {llm !== null && (
            <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${llm ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-muted"}`}>{llm ? `AI · ${toolCount ?? ""} live tools` : "rule-based mode"}</span>
          )}
          {msgs.length > 0 && !busy && (
            <button onClick={() => setMsgs([])} title="New chat" className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-white">
              New
            </button>
          )}
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className={`min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 ${page ? "[&>*]:mx-auto [&>*]:max-w-3xl sm:px-8" : ""}`}
      >
        {msgs.length === 0 && (
          <div className="space-y-4">
            <div className={`relative overflow-hidden px-4 pb-5 pt-4 ${page ? "" : "-mx-4 -mt-4 border-b border-line bg-[radial-gradient(60%_80%_at_50%_0%,rgba(124,196,255,0.08),transparent)]"}`}>
              <NeuralBrain active={busy} className={`mx-auto block w-full ${page ? "h-[300px] sm:h-[360px]" : "h-[230px]"}`} />
              <h3 className={`mt-2 text-center font-semibold tracking-tight ${page ? "text-2xl sm:text-4xl" : "text-lg"}`}>Ask Strix anything</h3>
              <p className={`mx-auto mt-2 text-center text-muted ${page ? "max-w-lg text-base" : "max-w-xs text-sm"}`}>
                An on-chain agent with a built-in analyst. It picks the right tools — safety scorecard, whales, wallets, Rug Radar, charts — runs them live and explains what matters.
              </p>
            </div>
            <div className={`flex flex-wrap gap-1.5 ${page ? "justify-center" : ""}`}>
              {COMMANDS.slice(0, page ? 10 : 6).map((c) => (
                <button key={c.cmd} onClick={() => pickCmd(c)} title={c.hint} className="rounded-md border border-line bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-zinc-400 hover:border-white/25 hover:text-white">
                  {c.cmd}
                </button>
              ))}
            </div>
            <div className={page ? "grid gap-2 sm:grid-cols-2" : "flex flex-col gap-2"}>
              {[...(watch.length ? [`Brief me on my watchlist (${watch.map((w) => w.symbol).slice(0, 3).join(", ")}${watch.length > 3 ? "…" : ""})`] : []), ...(current ? [`Full due diligence on ${current}`] : []), ...(watch.length ? SUGGESTIONS : [SUGGESTIONS[0], SUGGESTIONS[1], "Watch PONS and alert me if it drops 10%", ...SUGGESTIONS.slice(2)])].slice(0, page ? 8 : 7).map((s, i) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className="group flex animate-fade-up items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.015] px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] hover:text-white"
                >
                  {s}
                  <span className="text-muted transition group-hover:translate-x-0.5 group-hover:text-white" aria-hidden>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 animate-fade-up space-y-2 rounded-2xl rounded-br-sm bg-white/[0.07] px-4 py-2.5 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.image && <img src={m.image} alt="Attached screenshot" className="max-h-40 rounded-lg border border-line" />}
              <div>{m.content}</div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              {!!m.steps?.length && <Steps steps={m.steps} done={!m.pending && !busy || !!m.content} meta={m.meta} />}
              {!!m.cards?.length && <div className="grid gap-2">{m.cards.map((c, j) => <CardView key={j} c={c} onFocus={onFocus} />)}</div>}
              {m.pending && !m.content && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${d * 120}ms` }} />)}
                  </span>
                  {m.steps?.some((s) => !s.done) ? "Reading live data…" : m.steps?.length ? "Writing the answer…" : "Thinking…"}
                </div>
              )}
              {m.content && (
                <div className="relative">
                  <Answer text={m.content} />
                  {m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-blink bg-amber" />}
                </div>
              )}
              {m.error && <div className="rounded-xl bg-rose-400/10 px-3 py-2 text-sm text-rose-300">{m.error}</div>}
              {!m.pending && (m.content || m.error) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.content && (
                    <button onClick={() => copy(i)} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-white">{copied === i ? "Copied ✓" : "Copy"}</button>
                  )}
                  {!busy && <button onClick={() => retry(i)} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-white">↻ Retry</button>}
                </div>
              )}
              {!m.pending && !busy && i === msgs.length - 1 && !!m.followups?.length && (
                <div className="flex flex-col gap-1.5 pt-1">
                  {m.followups.map((f) => (
                    <button key={f} onClick={() => send(f)} className="group flex animate-fade-up items-center gap-2 rounded-lg border border-line bg-white/[0.015] px-3 py-2 text-left text-xs text-zinc-300 hover:border-white/25 hover:text-white">
                      <span className="text-amber">↳</span> {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className={`relative border-t border-line p-3 ${page ? "border-t-0 pb-4 sm:px-8 [&>*]:mx-auto [&>*]:max-w-3xl" : ""}`}
      >
        {cmdMatches.length > 0 && (
          <div className="absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl sm:inset-x-8">
            {cmdMatches.map((c, i) => (
              <button
                key={c.cmd}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickCmd(c);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-xs ${i === cmdIdx % cmdMatches.length ? "bg-white/[0.06]" : ""}`}
              >
                <span className="font-mono text-white">{c.cmd}</span>
                {c.arg && <span className="font-mono text-muted">{c.arg}</span>}
                <span className="ml-auto truncate text-zinc-400">{c.hint}</span>
              </button>
            ))}
          </div>
        )}
        {image && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-white/[0.03] p-1.5 text-xs text-zinc-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.thumb} alt="" className="h-12 w-12 rounded object-cover" />
            <span className="flex-1">Screenshot attached — Strix will read it and check it against live data.</span>
            <button type="button" onClick={() => setImage(null)} className="px-2 text-muted hover:text-white" aria-label="Remove image">✕</button>
          </div>
        )}
        {imgErr && <div className="mb-2 text-xs text-rose-300">{imgErr}</div>}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
            if (f) {
              e.preventDefault();
              attach(f);
            }
          }}
          className="flex items-end gap-2 rounded-xl border border-line bg-ink/60 p-1.5 focus-within:border-amber/40"
        >
          {!busy && (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} title="Attach a screenshot" aria-label="Attach image"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-zinc-400 transition hover:text-white">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.5l-8.5 8.5a6 6 0 0 1-8.5-8.5L13 3.5a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8L15 7.3" /></svg>
              </button>
            </>
          )}
          <textarea
            ref={ta}
            onPaste={(e) => {
              const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
              if (f) {
                e.preventDefault();
                attach(f);
              }
            }}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setCmdIdx(0);
            }}
            onKeyDown={(e) => {
              if (cmdMatches.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setCmdIdx((i) => (i + (e.key === "ArrowDown" ? 1 : cmdMatches.length - 1)) % cmdMatches.length);
                return;
              }
              if (cmdMatches.length && (e.key === "Tab" || e.key === "Enter") && !e.shiftKey) {
                const c = cmdMatches[cmdIdx % cmdMatches.length];
                if (c.arg || input !== c.cmd) {
                  e.preventDefault();
                  if (!c.arg) send(c.cmd);
                  else pickCmd(c);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={current ? `Ask about ${current} · / for commands` : "Ask Strix anything · / for commands"}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted"
          />
          {!busy && <MicButton onText={(t, final) => (final ? send(t) : setInput(t))} />}
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="rounded-lg border border-line px-3.5 py-2 text-sm text-zinc-200 hover:border-rose-400/40 hover:text-rose-200">
              ■ Stop
            </button>
          ) : (
            <button disabled={!input.trim() && !image} className="btn-primary rounded-lg px-3.5 py-2 text-sm disabled:opacity-40">Send</button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted">
          <span className="hidden sm:inline"><span className="font-mono">/</span> commands · Shift+Enter new line · </span>Research only · not financial advice
        </p>
      </form>
    </div>
  );
}
