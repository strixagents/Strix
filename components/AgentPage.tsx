"use client";

import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { AgentChat } from "./terminal/AgentChat";
import { fmtPrice, usePoll } from "./market-ui";
import { store, useStore, type Followed, type PriceAlert, type WatchItem } from "./store";
import { NotificationsCard } from "./Notifications";

const TOOLS: { icon: string; name: string; desc: string; href?: string }[] = [
  { icon: "⚡", name: "Actions", desc: "Sets price alerts, edits your watchlist, follows wallets" },
  { icon: "🔬", name: "Contract X-ray", desc: "Reads the bytecode: mint, blacklist, pause, upgrades, owner" },
  { icon: "🖼", name: "Reads screenshots", desc: "Paste a tweet or shill — it checks every claim on-chain" },
  { icon: "⚖", name: "Compare", desc: "2–4 tokens side by side: liquidity, age, risk" },
  { icon: "🛡", name: "Safety scorecard", desc: "A–F grade: honeypot, holders, dev wallet, copycats", href: "/app" },
  { icon: "🐋", name: "Whale tracker", desc: "Large buys/sells, bots filtered, wash-trading check", href: "/app" },
  { icon: "👛", name: "Wallet scanner", desc: "Holdings, risk per token, 24h activity", href: "/wallet" },
  { icon: "🚨", name: "Rug Radar", desc: "Liquidity pulls, crashes, mints, copycats", href: "/radar" },
  { icon: "🧠", name: "Smart money", desc: "Most active real wallets, bots removed", href: "/smart-money" },
  { icon: "📊", name: "Token analysis", desc: "On-chain stats + chart context (RSI, EMA, levels)", href: "/app" },
  { icon: "⌕", name: "Screener & new launches", desc: "Signals and a risk score on every pool", href: "/screener" },
  { icon: "📈", name: "Stock tokens", desc: "Token price vs the real share price", href: "/stocks" },
  { icon: "📰", name: "News", desc: "Robinhood Chain headlines" },
];

const CLI = `git clone https://github.com/strixagents/Strix
cd Strix && npm install && npm link

strix ask "Is PONS safe?"
strix radar
strix wallet 0x…`;

const MCP = `{
  "mcpServers": {
    "strix": {
      "command": "strix-mcp"
    }
  }
}`;

function Snippet({ title, code }: { title: string; code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#0c0c0c]">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-muted">
        {title}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
              setOk(true);
              setTimeout(() => setOk(false), 1400);
            }).catch(() => {});
          }}
          className="hover:text-white"
        >
          {ok ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300">{code}</pre>
    </div>
  );
}

/** The user's own watchlist / alerts / wallets with live prices — the same data the agent reads. */
function MyPanel({ heading = true }: { heading?: boolean }) {
  const watch = useStore<WatchItem[]>(store.watch, []);
  const alerts = useStore<PriceAlert[]>(store.alerts, []);
  const wallets = useStore<Followed[]>(store.followed, []);
  const pools = [...new Set([...watch.map((w) => w.pool), ...alerts.map((a) => a.pool)].map((p) => p.toLowerCase()))].join(",");
  const { data: prices } = usePoll<Record<string, number | null>>(pools ? `/api/price?pools=${pools}` : null, 30_000);
  const px = (pool: string) => prices?.[pool.toLowerCase()] ?? null;
  return (
    <div className="mb-7">
      {heading && <h2 className="text-sm font-semibold">Your watchlist</h2>}
      {!watch.length && !alerts.length && !wallets.length ? (
        <p className="mt-1 text-xs text-muted">
          Empty. Tell the agent “watch PONS”, “alert me if CASHCAT drops 10%” or “follow 0x…”. Saved in this browser only.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-1">
            {watch.map((w) => (
              <li key={w.pool} className="flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-xs hover:bg-white/[0.04]">
                <Link href={`/app?pool=${w.pool}`} className="w-24 truncate text-zinc-200 hover:underline">{w.symbol}</Link>
                <span className="ml-auto text-zinc-400">{px(w.pool) != null ? `$${fmtPrice(px(w.pool))}` : "…"}</span>
                <button onClick={() => store.removeWatch(w.pool)} className="text-muted hover:text-white" aria-label={`Remove ${w.symbol}`}>✕</button>
              </li>
            ))}
          </ul>
          {!!alerts.length && (
            <ul className="mt-2 space-y-1">
              {alerts.map((a) => {
                const now = px(a.pool);
                const dist = now ? ((a.price - now) / now) * 100 : null;
                return (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-[11px] text-amber">
                    🔔 {a.symbol} {a.dir === "above" ? "≥" : "≤"} ${fmtPrice(a.price)}
                    <span className="ml-auto text-zinc-500">{dist != null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(1)}%` : ""}</span>
                    <button onClick={() => store.setAlerts(alerts.filter((x) => x.id !== a.id))} className="text-muted hover:text-white" aria-label="Delete alert">✕</button>
                  </li>
                );
              })}
            </ul>
          )}
          {!!wallets.length && (
            <ul className="mt-2 space-y-1">
              {wallets.map((w) => (
                <li key={w.address} className="flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-[11px]">
                  👁 <Link href={`/wallet?address=${w.address}`} className="text-zinc-300 hover:underline">{w.label}</Link>
                  <button onClick={() => store.unfollow(w.address)} className="ml-auto text-muted hover:text-white" aria-label="Unfollow">✕</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="mt-3"><NotificationsCard compact /></div>
    </div>
  );
}

/** Small screens have no sidebar — the same watchlist panel opens from a bar above the chat. */
function MobileWatchlist() {
  const [open, setOpen] = useState(false);
  const watch = useStore<WatchItem[]>(store.watch, []);
  const alerts = useStore<PriceAlert[]>(store.alerts, []);
  return (
    <div className="border-b border-line xl:hidden">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm">
        <span>⭐ Your watchlist</span>
        <span className="font-mono text-[11px] text-muted">
          {watch.length} token{watch.length === 1 ? "" : "s"} · {alerts.length} alert{alerts.length === 1 ? "" : "s"}
        </span>
        <span className={`ml-auto text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>
      {open && (
        <div className="max-h-[45dvh] overflow-y-auto px-4 pb-1">
          <MyPanel heading={false} />
        </div>
      )}
    </div>
  );
}

export function AgentPage() {
  return (
    <div className="flex h-dvh flex-col bg-ink">
      <AppHeader />
      <MobileWatchlist />
      <div className="flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(124,196,255,0.07),transparent)]" aria-hidden />
          <div className="relative h-full">
            <AgentChat page />
          </div>
        </section>

        <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l border-line p-5 xl:block">
          <MyPanel />
          <h2 className="text-sm font-semibold">Built-in analyst</h2>
          <p className="mt-1 text-xs text-muted">The agent decides which of these live tools to run for your question.</p>
          <ul className="mt-3 space-y-1">
            {TOOLS.map((t) => {
              const inner = (
                <>
                  <span className="w-5 text-center">{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-zinc-200">{t.name}</span>
                    <span className="block text-[11px] text-muted">{t.desc}</span>
                  </span>
                </>
              );
              return (
                <li key={t.name}>
                  {t.href ? (
                    <Link href={t.href} className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">{inner}</Link>
                  ) : (
                    <div className="flex gap-2.5 px-2 py-1.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <h2 className="mt-7 text-sm font-semibold">Same agent in your terminal</h2>
          <p className="mt-1 text-xs text-muted">The CLI and the MCP server call the exact same tools as this page, — no server to run, it uses strixagents.com.</p>
          <div className="mt-3 space-y-3">
            <Snippet title="CLI" code={CLI} />
            <Snippet title="MCP · .mcp.json (Claude Code & other MCP clients)" code={MCP} />
          </div>
          <a href="https://github.com/strixagents/Strix" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-zinc-400 hover:text-white">
            Source & docs on GitHub ↗
          </a>
          <p className="mt-6 text-[11px] text-muted">Research agent — it explains data and risk, it never tells you what to buy or sell.</p>
        </aside>
      </div>
    </div>
  );
}
