"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { Pct, RISK_LABELS, TokenIcon, fmtPrice, fmtUsd, riskCls } from "./market-ui";

type Risk = { flags: string[]; score: number; level: "Low" | "Medium" | "High" };
type Holding = {
  address: string; symbol: string; name: string; image: string | null; balance: number; price: number | null; value: number | null;
  change24h: number | null; liquidity: number | null; pool: string | null; risk: Risk | null; spam: boolean; spamReason?: string;
};
type Flow = { token: string; symbol: string; amount: number; usd: number | null };
type Trade = { tx: string; block: number; time: string; kind: "swap" | "buy" | "sent" | "received" | "airdrop"; sent: Flow[]; received: Flow[]; ethIn: number };
type Scan = {
  address: string; txCount: number | null; isBot: boolean; totalValue: number; highRiskValue: number; holdings: Holding[]; spamCount: number; checkedTokens: number;
  activity: { hours: number; coveredHours: number; complete: boolean; trades: Trade[]; airdrops: number; swaps: number; netFlows: { token: string; symbol: string; inUsd: number; outUsd: number; netUsd: number; trades: number }[] };
  error?: string;
};
type Followed = { address: string; label: string };

const EXPLORER = "https://robinhoodchain.blockscout.com";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const amt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n >= 1 ? n.toFixed(2) : n.toPrecision(3));
const ago = (iso: string) => {
  const m = (Date.now() - Date.parse(iso)) / 60000;
  return m < 1 ? "now" : m < 60 ? `${Math.round(m)}m` : `${Math.round(m / 60)}h`;
};
const KIND: Record<Trade["kind"], { label: string; cls: string }> = {
  swap: { label: "Swap", cls: "bg-violet/15 text-violet" },
  buy: { label: "Buy (ETH)", cls: "bg-emerald-400/10 text-emerald-300" },
  sent: { label: "Sent", cls: "bg-rose-400/10 text-rose-300" },
  received: { label: "Received", cls: "bg-sky-400/10 text-sky-300" },
  airdrop: { label: "Airdrop", cls: "bg-white/5 text-muted" },
};
const FOLLOW_KEY = "strix.follow";

function loadFollowed(): Followed[] {
  try {
    return JSON.parse(localStorage.getItem(FOLLOW_KEY) || "[]");
  } catch {
    return [];
  }
}

export function WalletPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState(params.get("address") ?? "");
  const [address, setAddress] = useState(params.get("address") ?? "");
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSpam, setShowSpam] = useState(false);
  const [followed, setFollowed] = useState<Followed[]>([]);

  useEffect(() => setFollowed(loadFollowed()), []);

  useEffect(() => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return;
    let alive = true;
    setLoading(true);
    setScan(null);
    router.replace(`/wallet?address=${address}`, { scroll: false });
    fetch(`/api/wallet?address=${address}&hours=24`)
      .then((r) => r.json())
      .then((j: Scan) => alive && setScan(j))
      .catch((e) => alive && setScan({ error: e.message } as Scan))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [address, router]);

  const submit = (a: string) => {
    const v = a.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) {
      setScan({ error: "That doesn't look like a wallet address (0x + 40 hex characters)." } as Scan);
      return;
    }
    setInput(v);
    setAddress(v.toLowerCase());
  };

  const useConnected = async () => {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<unknown> } }).ethereum;
    if (!eth) return setScan({ error: "No wallet extension found — paste an address instead." } as Scan);
    const acc = (await eth.request({ method: "eth_requestAccounts" }).catch(() => [])) as string[];
    if (acc[0]) submit(acc[0]);
  };

  const isFollowed = followed.some((f) => f.address === address);
  const toggleFollow = () => {
    const next = isFollowed ? followed.filter((f) => f.address !== address) : [...followed, { address, label: short(address) }];
    setFollowed(next);
    try {
      localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
    } catch {}
  };

  const real = scan?.holdings?.filter((h) => !h.spam) ?? [];
  const spam = scan?.holdings?.filter((h) => h.spam) ?? [];
  const highPct = scan && scan.totalValue > 0 ? (scan.highRiskValue / scan.totalValue) * 100 : 0;
  const maxFlow = Math.max(1, ...(scan?.activity?.netFlows ?? []).map((f) => Math.abs(f.netUsd)));

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Wallet scanner</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Paste any Robinhood Chain wallet: live holdings with a risk grade for every token, fake airdrops filtered out, and what the wallet bought and sold in the last 24 hours.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mt-5 flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x… wallet address"
            spellCheck={false}
            className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 font-mono text-sm outline-none placeholder:text-muted focus:border-white/30"
          />
          <button className="btn-primary px-5 py-3 text-sm">Scan wallet</button>
          <button type="button" onClick={useConnected} className="btn-secondary px-4 py-3 text-sm">Use my wallet</button>
        </form>

        {followed.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Following:</span>
            {followed.map((f) => (
              <button key={f.address} onClick={() => submit(f.address)} className={`rounded-full border px-2.5 py-1 font-mono ${f.address === address ? "border-white/40 bg-white/10 text-white" : "border-line text-zinc-300 hover:text-white"}`}>
                ★ {f.label}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="mt-8 rounded-2xl border border-line bg-panel p-6 text-sm text-muted">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white/70" />
              Reading balances of ~100 tokens and the last 24h of transfers on chain 4663…
            </div>
            <div className="mt-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />)}</div>
          </div>
        )}

        {scan?.error && !loading && <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{scan.error}</div>}

        {scan && !scan.error && !loading && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-white">{short(scan.address)}</span>
              <a href={`${EXPLORER}/address/${scan.address}`} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-white">Explorer ↗</a>
              <button onClick={() => navigator.clipboard?.writeText(scan.address)} className="text-xs text-muted hover:text-white">Copy ⧉</button>
              <button onClick={toggleFollow} className={`ml-auto rounded-lg border px-3 py-1.5 text-xs ${isFollowed ? "border-amber/40 bg-amber/10 text-amber" : "border-line text-zinc-300 hover:text-white"}`}>
                {isFollowed ? "★ Following" : "☆ Follow wallet"}
              </button>
            </div>

            {scan.isBot && (
              <div className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
                ⚠ This address has sent {scan.txCount?.toLocaleString("en-US")} transactions — it behaves like a trading bot or an order relayer, not a person.
                Trades it signs often move other users&apos; funds, so don&apos;t copy it as &ldquo;smart money&rdquo;.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Portfolio value</div><div className="mt-1 font-mono text-xl">{fmtUsd(scan.totalValue)}</div></div>
              <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Tokens held</div><div className="mt-1 font-mono text-xl">{real.length}</div></div>
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="text-[11px] uppercase text-muted">In high-risk tokens</div>
                <div className={`mt-1 font-mono text-xl ${highPct > 20 ? "text-rose-300" : highPct > 0 ? "text-amber" : "text-emerald-300"}`}>{highPct.toFixed(1)}%</div>
              </div>
              <div className="rounded-2xl border border-line bg-panel p-4"><div className="text-[11px] uppercase text-muted">Transactions sent</div><div className="mt-1 font-mono text-xl">{scan.txCount?.toLocaleString("en-US") ?? "–"}</div></div>
            </div>

            {/* holdings */}
            <div className="rounded-2xl border border-line bg-panel">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted">Holdings</div>
                {spam.length > 0 && (
                  <button onClick={() => setShowSpam((v) => !v)} className="text-xs text-muted hover:text-white">
                    {showSpam ? "Hide" : "Show"} {spam.length} spam / fake token{spam.length > 1 ? "s" : ""}
                  </button>
                )}
              </div>
              {real.length === 0 && <p className="px-4 py-6 text-sm text-muted">No priced tokens found in this wallet.</p>}
              <ul className="divide-y divide-line">
                {[...real, ...(showSpam ? spam : [])].map((h) => (
                  <li key={h.address + h.symbol} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${h.spam ? "opacity-60" : ""}`}>
                    <TokenIcon t={{ image: h.image, symbol: h.symbol }} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {h.pool ? <Link href={`/app?pool=${h.pool}`} className="font-medium hover:underline">{h.symbol}</Link> : <span className="font-medium">{h.symbol}</span>}
                        {h.risk && <span className={`rounded px-1.5 py-0.5 text-[10px] ${riskCls[h.risk.level]}`}>{h.risk.level}</span>}
                        {h.spam && <span className="rounded border border-rose-400/40 bg-rose-400/10 px-1.5 text-[10px] text-rose-300">{h.spamReason ?? "spam"}</span>}
                        {h.risk?.flags.slice(0, 2).map((f) => (
                          <span key={f} className="rounded border border-line px-1.5 text-[10px] text-zinc-400">{RISK_LABELS[f]?.label ?? f}</span>
                        ))}
                      </div>
                      <div className="truncate text-[11px] text-muted">{amt(h.balance)} {h.symbol}{h.price != null ? ` · $${fmtPrice(h.price)}` : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{h.value != null ? fmtUsd(h.value) : "–"}</div>
                      {h.change24h != null && <Pct v={h.change24h} className="text-[11px]" />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* smart money */}
            <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-3 text-[11px] uppercase tracking-wide text-muted">Net flow · last {scan.activity.coveredHours}h</div>
                {scan.activity.netFlows.length === 0 ? (
                  <p className="text-sm text-muted">No buys or sells in this window.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {scan.activity.netFlows.slice(0, 8).map((f) => (
                      <li key={f.token}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{f.symbol}</span>
                          <span className={`font-mono ${f.netUsd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {f.netUsd >= 0 ? "accumulating +" : "reducing −"}{fmtUsd(Math.abs(f.netUsd))}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className={f.netUsd >= 0 ? "h-full bg-emerald-400" : "h-full bg-rose-400"} style={{ width: `${(Math.abs(f.netUsd) / maxFlow) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {!scan.activity.complete && <p className="mt-3 text-[11px] text-amber">RPC was busy — only the last {scan.activity.coveredHours}h could be read.</p>}
              </div>

              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wide text-muted">
                  <span>Recent activity</span>
                  {scan.activity.airdrops > 0 && <span className="normal-case">{scan.activity.airdrops} unsolicited airdrops hidden</span>}
                </div>
                {scan.activity.trades.length === 0 ? (
                  <p className="text-sm text-muted">No transfers in the last {scan.activity.coveredHours}h.</p>
                ) : (
                  <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 text-xs">
                    {scan.activity.trades.map((t) => (
                      <li key={t.tx} className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-2.5 py-2">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${KIND[t.kind].cls}`}>{KIND[t.kind].label}</span>
                        <span className="min-w-0 flex-1 text-zinc-300">
                          {[t.ethIn > 0 ? `${amt(t.ethIn)} ETH` : "", ...t.sent.map((f) => `${amt(f.amount)} ${f.symbol}`)].filter(Boolean).join(" + ") || ""}
                          {(t.sent.length > 0 || t.ethIn > 0) && t.received.length > 0 ? " → " : ""}
                          {t.received.map((f) => `${amt(f.amount)} ${f.symbol}`).join(" + ")}
                          {(() => {
                            const usd = [...t.received, ...t.sent].reduce((s, f) => Math.max(s, f.usd ?? 0), 0);
                            return usd > 0 ? <span className="text-muted"> · {fmtUsd(usd)}</span> : null;
                          })()}
                        </span>
                        <a href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noreferrer" className="shrink-0 text-muted hover:text-white">{ago(t.time)} ↗</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="text-xs text-muted">
              Checked {scan.checkedTokens} tokens (top, trending, new and stock tokens, plus everything this wallet moved recently). Balances read live from the Robinhood Chain RPC.
              Swaps paid in native ETH show as &ldquo;Buy (ETH)&rdquo;; sales into native ETH show as &ldquo;Sent&rdquo;. Not financial advice.
            </p>
          </div>
        )}

        {!scan && !loading && (
          <div className="mt-8 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
            Tip: open any token in the <Link href="/app" className="text-white underline">terminal</Link>, go to <b>Analyst → Whales</b> and click a wallet to see everything it has been trading.
          </div>
        )}
      </main>
    </div>
  );
}
