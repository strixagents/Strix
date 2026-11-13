"use client";

import { useState } from "react";

/** Share a token report: X, Telegram, or copy the link. */
export function ShareReport({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  const btn = "inline-flex items-center gap-2 rounded-xl border border-line bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/[0.08]";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={x} target="_blank" rel="noreferrer" className={btn}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
        Share on X
      </a>
      <a href={tg} target="_blank" rel="noreferrer" className={btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" /></svg>
        Telegram
      </a>
      <button type="button" onClick={copy} className={btn}>{copied ? "Copied ✓" : "Copy link"}</button>
    </div>
  );
}
