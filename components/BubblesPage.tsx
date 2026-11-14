"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { HolderMap } from "./HolderMap";

export function BubblesPage({ token }: { token: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState(token ?? "");
  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Bubble Map</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Who really holds this token?</h1>
        <p className="mt-2 max-w-2xl text-muted">
          The top holders of any Robinhood Chain token as bubbles. Wallets that sent each other tokens, were filled by the same wallet or
          bought together get linked — so 20 &quot;different&quot; holders that are really one player show up as one group.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); const s = q.trim(); if (s) router.push(`/bubbles?token=${encodeURIComponent(s)}`); }}
          className="mt-6 flex max-w-2xl gap-2"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Token address, pool or symbol (e.g. PONS)" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-4 font-mono text-sm outline-none focus:border-white/30" />
          <button type="submit" className="btn-primary px-5 text-sm">Map holders</button>
        </form>
        <div className="mt-8">
          {token ? <HolderMap key={token} token={token} /> : <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Enter a token above to draw its holder map.</div>}
        </div>
      </main>
    </div>
  );
}
