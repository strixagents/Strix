"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { fmtPrice, fmtUsd } from "./market-ui";
import { NotificationsCard } from "./Notifications";
import { openSearch } from "./QuickSearch";
import { store, useStore, type Followed, type PriceAlert, type WatchItem } from "./store";

type Row = {
  pool: string; ok: boolean; symbol?: string; name?: string; image?: string | null; address?: string;
  price?: number; change?: { h1: number; h24: number }; liquidity?: number; volume24?: number;
  risk?: "Low" | "Medium" | "High"; flags?: string[]; copycat?: boolean;
};

const riskCls = { Low: "text-emerald-300 border-emerald-400/30", Medium: "text-amber border-amber/30", High: "text-rose-300 border-rose-400/30" } as const;
const pct = (n?: number) => (n == null ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
const pctCls = (n?: number) => (n == null ? "text-muted" : n >= 0 ? "text-emerald-300" : "text-rose-300");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Card({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

export function MyStrix() {
  const watch = useStore<WatchItem[]>(store.watch, []);
  const alerts = useStore<PriceAlert[]>(store.alerts, []);
  const followed = useStore<Followed[]>(store.followed, []);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [at, setAt] = useState<number | null>(null);
  const [wallet, setWallet] = useState("");

  const key = watch.map((w) => w.pool.toLowerCase()).join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/watch?pools=${key}`).then((x) => x.json()).catch(() => null);
      if (stop || !r) return;
      setRows(Object.fromEntries((r.rows as Row[]).map((x) => [x.pool, x])));
      setAt(r.at);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [key]);

  const addWallet = (e: React.FormEvent) => {
    e.preventDefault();
    const a = wallet.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return;
    store.follow({ address: a, label: short(a) });
    setWallet("");
  };

  const highRisk = watch.filter((w) => rows[w.pool.toLowerCase()]?.risk === "High").length;

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber">My Strix</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Your tokens, alerts and wallets</h1>
            <p className="mt-2 max-w-2xl text-muted">Everything you watch in one place, refreshed live every minute. Saved in this browser only — no account needed.</p>
          </div>
          <button type="button" onClick={openSearch} className="btn-primary px-4 py-2 text-sm">+ Add a token</button>
        </div>

        {/* summary */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Watching", String(watch.length)],
            ["High risk now", String(highRisk)],
            ["Price alerts", String(alerts.length)],
            ["Wallets followed", String(followed.length)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-wider text-muted">{k}</div>
              <div className={`mt-1 font-mono text-2xl ${k === "High risk now" && highRisk ? "text-rose-300" : ""}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5">
          <Card
            title="Watchlist"
            sub={at ? `Live · updated ${new Date(at).toLocaleTimeString("en-US",{ hour: "2-digit", minute: "2-digit" })}` : "Tap ☆ Watch on any token report to add it here."}
          >
            {!watch.length ? (
              <Empty>
                Nothing yet. Tap <span className="text-zinc-200">⌕ Search</span> (or <kbd className="rounded border border-white/15 px-1 font-mono text-[11px]">Ctrl K</kbd>), find a token and hit <span className="text-zinc-200">☆ Watch</span> on its report.
              </Empty>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted">
                      <th className="px-2 py-2 font-normal">Token</th>
                      <th className="px-2 py-2 text-right font-normal">Price</th>
                      <th className="px-2 py-2 text-right font-normal">1h</th>
                      <th className="px-2 py-2 text-right font-normal">24h</th>
                      <th className="px-2 py-2 text-right font-normal">Liquidity</th>
                      <th className="px-2 py-2 text-right font-normal">Volume 24h</th>
                      <th className="px-2 py-2 text-center font-normal">Risk</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {watch.map((w) => {
                      const r = rows[w.pool.toLowerCase()];
                      return (
                        <tr key={w.pool} className="border-t border-line">
                          <td className="px-2 py-3">
                            <Link href={`/t/${w.pool}`} className="flex items-center gap-3 hover:text-white">
                              {r?.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.image} alt="" className="h-8 w-8 rounded-full bg-white/5" />
                              ) : (
                                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs">{w.symbol.slice(0, 1)}</span>
                              )}
                              <span>
                                <span className="block font-medium">${r?.symbol ?? w.symbol}</span>
                                <span className="block text-xs text-muted">{r?.ok === false ? "Couldn't load right now" : r?.name ?? "Loading…"}{r?.copycat ? " · copies an older token" : ""}</span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-2 py-3 text-right font-mono">{r?.price != null ? `$${fmtPrice(r.price)}` : "–"}</td>
                          <td className={`px-2 py-3 text-right font-mono ${pctCls(r?.change?.h1)}`}>{pct(r?.change?.h1)}</td>
                          <td className={`px-2 py-3 text-right font-mono ${pctCls(r?.change?.h24)}`}>{pct(r?.change?.h24)}</td>
                          <td className="px-2 py-3 text-right font-mono">{r?.liquidity != null ? fmtUsd(r.liquidity) : "–"}</td>
                          <td className="px-2 py-3 text-right font-mono">{r?.volume24 != null ? fmtUsd(r.volume24) : "–"}</td>
                          <td className="px-2 py-3 text-center">
                            {r?.risk ? <span className={`rounded-full border px-2.5 py-0.5 text-xs ${riskCls[r.risk]}`}>{r.risk}</span> : <span className="text-muted">–</span>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-3 text-right">
                            <Link href={`/t/${w.pool}`} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-white">Report</Link>
                            <Link href={`/app?pool=${w.pool}`} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-white">Chart</Link>
                            <button type="button" onClick={() => store.removeWatch(w.pool)} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-rose-300" aria-label={`Remove ${w.symbol}`}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Price alerts" sub="Checked every minute while Strix is open; with notifications on, they reach your phone too.">
              {!alerts.length ? (
                <Empty>No alerts. Open a token report and set a price under <span className="text-zinc-200">Price alerts</span>.</Empty>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a) => {
                    const now = rows[a.pool.toLowerCase()]?.price;
                    const away = now ? ((a.price - now) / now) * 100 : null;
                    return (
                      <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                        <span className={a.dir === "above" ? "text-emerald-300" : "text-rose-300"}>{a.dir === "above" ? "▲" : "▼"}</span>
                        <Link href={`/t/${a.pool}`} className="min-w-0 flex-1 truncate hover:text-white">
                          ${a.symbol} {a.dir} <span className="font-mono">${fmtPrice(a.price)}</span>
                          {away != null && <span className="ml-2 font-mono text-xs text-muted">{away >= 0 ? "+" : ""}{away.toFixed(1)}% away</span>}
                        </Link>
                        <button type="button" onClick={() => store.setAlerts(store.alerts().filter((x) => x.id !== a.id))} className="text-xs text-muted hover:text-rose-300" aria-label="Remove alert">✕</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Followed wallets" sub="Scan any wallet for holdings, risky tokens and its last 24h.">
              <form onSubmit={addWallet} className="mb-3 flex gap-2">
                <input value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x… wallet address" className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 font-mono text-sm outline-none focus:border-white/30" />
                <button type="submit" className="btn-secondary px-4 text-sm">Follow</button>
              </form>
              {!followed.length ? (
                <Empty>Follow a wallet — yours or one you track — to open its scan in one tap.</Empty>
              ) : (
                <ul className="space-y-2">
                  {followed.map((f) => (
                    <li key={f.address} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                      <span>👛</span>
                      <Link href={`/wallet?address=${f.address}`} className="min-w-0 flex-1 truncate font-mono hover:text-white">{f.label || short(f.address)}</Link>
                      <Link href={`/wallet?address=${f.address}`} className="text-xs text-muted hover:text-white">Scan</Link>
                      <button type="button" onClick={() => store.unfollow(f.address)} className="text-xs text-muted hover:text-rose-300" aria-label="Unfollow">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <NotificationsCard />
        </div>
      </main>
    </div>
  );
}
