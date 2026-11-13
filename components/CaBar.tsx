"use client";

import { useState } from "react";
import { EXPLORER_TOKEN } from "@/lib/token";

/** Announcement bar carrying the official contract address, with copy + explorer link. */
export default function CaBar({ ca }: { ca: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  return (
    <div className="relative z-10 flex items-center justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] bg-[#0d0d0d]/60 px-5 py-3 text-[15px] backdrop-blur-md sm:px-8">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-0.5 font-mono text-[12px] uppercase tracking-[0.14em] text-amber">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          Official CA
        </span>
        <code className="hidden min-w-0 break-all font-mono text-[15px] text-white sm:inline">{ca}</code>
        <code className="font-mono text-[14px] text-white sm:hidden">{ca.slice(0, 8)}…{ca.slice(-6)}</code>
        <span className="hidden text-zinc-400 lg:inline">· the only official address — beware of copycats</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1 font-mono text-[13px] text-white transition hover:bg-white/[0.12]"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <a
          href={EXPLORER_TOKEN(ca)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg px-2 py-1 font-mono text-[13px] text-muted transition hover:text-white"
        >
          Explorer ↗
        </a>
      </div>
    </div>
  );
}
