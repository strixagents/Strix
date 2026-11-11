"use client";

import { useState } from "react";

/** Code block with a copy button. */
export function CopyCode({ code, title }: { code: string; title?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-line bg-[#0c0c0e]">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-[11px] text-muted">
        <span className="font-mono">{title ?? "shell"}</span>
        <button
          onClick={() =>
            navigator.clipboard
              ?.writeText(code)
              .then(() => {
                setOk(true);
                setTimeout(() => setOk(false), 1400);
              })
              .catch(() => {})
          }
          className="hover:text-white"
        >
          {ok ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-zinc-300">{code}</pre>
    </div>
  );
}
