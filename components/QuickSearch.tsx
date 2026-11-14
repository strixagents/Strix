"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ⌘K / Ctrl+K anywhere: paste a contract address, a wallet or type a symbol and jump straight to the
 * safety report, the wallet scan or the chart. Also opened by any element dispatching "strix:search".
 */
type Hit = { pool: string; symbol: string; name: string; liquidity: number; image: string | null; price: number };
type Item = { key: string; title: string; sub: string; href: string; icon: string };

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const isPoolId = (s: string) => /^0x[0-9a-fA-F]{64}$/.test(s);
const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

export function openSearch() {
  window.dispatchEvent(new Event("strix:search"));
}

export function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("strix:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("strix:search", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 20);
    else { setQ(""); setHits([]); setSel(0); }
  }, [open]);

  // symbol search (debounced); addresses need no lookup
  useEffect(() => {
    const s = q.trim().replace(/^\$/, "");
    if (!s || isAddr(s) || isPoolId(s)) { setHits([]); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`).then((x) => x.json()).catch(() => ({ results: [] }));
      setHits((r.results ?? []).slice(0, 6));
      setBusy(false);
      setSel(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const s = q.trim();
  const items: Item[] = isAddr(s)
    ? [
        { key: "t", title: "Safety report for this token", sub: s, href: `/t/${s}`, icon: "🛡️" },
        { key: "w", title: "Scan this wallet", sub: "Holdings, risk per token, 24h activity", href: `/wallet?address=${s}`, icon: "👛" },
        { key: "c", title: "Contract X-ray", sub: "Admin powers in the bytecode", href: `/agent?q=${encodeURIComponent(`/contract ${s}`)}`, icon: "🔬" },
      ]
    : isPoolId(s)
      ? [{ key: "p", title: "Safety report for this pool", sub: s, href: `/t/${s}`, icon: "🛡️" }]
      : [
          ...hits.map((h) => ({ key: h.pool, title: `$${h.symbol}`, sub: h.liquidity >= 1 ? `${h.name} · liquidity ${usd(h.liquidity)}` : `${h.name} · no liquidity — likely a copy`, href: `/t/${h.pool}`, icon: "🪙" })),
          ...(s ? [{ key: "ask", title: `Ask the agent: “${s}”`, sub: "Runs live tools and explains", href: `/agent?q=${encodeURIComponent(s)}`, icon: "🧠" }] : []),
        ];

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#0d0d10] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <span className="text-muted">⌕</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((x) => Math.min(x + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter" && items[sel]) go(items[sel].href);
            }}
            placeholder="Paste a contract address, a wallet, or type a symbol…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-500"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-muted">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {!s && (
            <li className="px-3 py-4 text-sm text-muted">
              Try <span className="font-mono text-zinc-300">PONS</span>, a token address for its safety report, or a wallet address to scan it.
            </li>
          )}
          {s && busy && !items.length && <li className="px-3 py-4 text-sm text-muted">Searching…</li>}
          {items.map((it, i) => (
            <li key={it.key}>
              <button
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => go(it.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === sel ? "bg-white/[0.07]" : ""}`}
              >
                <span className="text-lg">{it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{it.title}</span>
                  <span className="block truncate font-mono text-[11px] text-muted">{it.sub}</span>
                </span>
                {i === sel && <span className="font-mono text-[10px] text-muted">↵</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Small "Search ⌘K" button for headers. */
export function SearchButton({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={openSearch} className={`inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-400 transition hover:text-white ${className}`} aria-label="Search">
      <span>⌕</span>
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden rounded border border-white/15 px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
    </button>
  );
}
