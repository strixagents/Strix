"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ScaledOrbit } from "../landing/HeroOrbit";

type Step = { id: string; label: string; done?: boolean; ok?: boolean; summary?: string };
type Msg = { role: "user" | "assistant"; content: string; steps?: Step[]; pending?: boolean; error?: string };

const SUGGESTIONS = [
  "How is Robinhood Chain doing today?",
  "Is PONS safe? Check holders & rug risk",
  "Are whales accumulating CASHCAT?",
  "Which tokens are pumping with low risk?",
  "Analyze NVDA on 1h & 4h — entry, stop & targets",
  "Any interesting new launches? Check their risk",
  "Which tokens show buy pressure right now?",
  "Compare PONS vs CASHCAT",
];

export function AgentChat({ onFocus, current }: { onFocus: (pool: string, interval: string) => void; current: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState<boolean | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((j) => setLlm(j.llm)).catch(() => setLlm(false));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history = [...msgs.filter((m) => !m.error), { role: "user" as const, content: text.trim() }];
    setMsgs([...history, { role: "assistant", content: "", steps: [], pending: true }]);
    setInput("");
    setBusy(true);

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
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === "step") patch((m) => ({ ...m, steps: [...(m.steps ?? []), { id: e.id, label: e.label }] }));
          else if (e.t === "step_done")
            patch((m) => ({ ...m, steps: m.steps?.map((s) => (s.id === e.id ? { ...s, done: true, ok: e.ok, summary: e.summary } : s)) }));
          else if (e.t === "focus") onFocus(e.pool, e.interval);
          else if (e.t === "answer") patch((m) => ({ ...m, content: e.text, pending: false }));
          else if (e.t === "error") patch((m) => ({ ...m, steps: [...(m.steps ?? []), { id: "err", label: "AI provider error — falling back", done: true, ok: false, summary: e.message.slice(0, 120) }] }));
        }
      }
      patch((m) => ({ ...m, pending: false }));
    } catch (e) {
      patch((m) => ({ ...m, pending: false, error: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber" /> Strix Agent
        </div>
        {llm !== null && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${llm ? "bg-emerald-400/10 text-emerald-400" : "bg-white/5 text-muted"}`}>
            {llm ? "AI mode" : "rule-based mode"}
          </span>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="space-y-4">
            <div className="relative -mx-4 -mt-4 overflow-hidden border-b border-line bg-[radial-gradient(60%_80%_at_50%_0%,rgba(124,196,255,0.08),transparent)] px-4 pb-5 pt-4">
              <ScaledOrbit scale={0.42} className="pointer-events-none mx-auto" />
              <h3 className="mt-2 text-center text-lg font-semibold tracking-tight">Ask Strix anything</h3>
              <p className="mx-auto mt-1 max-w-xs text-center text-sm text-muted">
                Any Robinhood Chain token — live on-chain data, indicators, whales and rug risk, explained.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[`Analyze ${current} now`, ...SUGGESTIONS].map((s, i) => (
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
            <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-white/[0.07] px-4 py-2.5 text-sm">
              {m.content}
            </div>
          ) : (
            <div key={i} className="space-y-3">
              {!!m.steps?.length && (
                <ul className="space-y-1.5 border-l border-line pl-3 font-mono text-[11px]">
                  {m.steps.map((s) => (
                    <li key={s.id} className="flex gap-2">
                      <span className={!s.done ? "animate-pulse text-amber" : s.ok ? "text-emerald-400" : "text-rose-400"}>
                        {!s.done ? "◐" : s.ok ? "✓" : "✕"}
                      </span>
                      <span className="text-zinc-400">
                        {s.label}
                        {s.summary && <span className="block text-zinc-500">→ {s.summary}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {m.pending && !m.content && <div className="text-sm text-muted animate-pulse">Thinking…</div>}
              {m.content && (
                <div className="prose-strix text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
              {m.error && <div className="rounded-xl bg-rose-400/10 px-3 py-2 text-sm text-rose-300">{m.error}</div>}
            </div>
          )
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-line bg-ink/60 p-1.5 focus-within:border-amber/40">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about any token…"
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted"
          />
          <button
            disabled={busy || !input.trim()}
            className="btn-primary rounded-lg px-3.5 py-2 text-sm disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted">Research only · not financial advice</p>
      </form>
    </div>
  );
}
