"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero demo that runs REAL Strix tools (same /api/tool the agent uses) and shows the actual results.
 * Nothing here is scripted: steps and the result line are built from live Robinhood Chain data.
 */

type Line = { icon: string; text: string; tone: "ok" | "think" | "tool" | "bad" };
type Scenario = { prompt: string; tool: string; args: Record<string, unknown>; build: (d: any, summary: string) => { steps: Line[]; result: string } };

const usd = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "–" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
const price = (n: number | null | undefined) =>
  n == null || !isFinite(n) ? "–" : n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : n >= 1 ? `$${+n.toFixed(4)}` : `$${n.toPrecision(4)}`;
const pct = (n: number | null | undefined) => (n == null || !isFinite(n) ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

const SCENARIOS: Scenario[] = [
  {
    prompt: "Analyze NVDA on Robinhood Chain — where are support and resistance?",
    tool: "analyze_token",
    args: { token: "NVDA", interval: "1h" },
    build: (d) => {
      const ta = typeof d.technical === "object" ? d.technical : null;
      return {
        steps: [
          { icon: "◐", text: `Pool ${d.symbol}/${d.quote} on ${d.dex} · liquidity ${usd(d.liquidityUsd)}`, tone: "tool" },
          { icon: "◑", text: `Price ${price(d.priceUsd)} · 24h ${pct(d.changePct?.h24)} · ${d.txns24h?.buys ?? 0} buys / ${d.txns24h?.sells ?? 0} sells`, tone: "tool" },
          ta
            ? { icon: "✦", text: `RSI ${ta.rsi?.toFixed(1)} · EMA50 ${price(ta.ema50)} · bias ${ta.bias}`, tone: "think" }
            : { icon: "✦", text: "Not enough candle history yet — using on-chain stats", tone: "think" },
          { icon: "✓", text: `Risk check: ${d.risk?.level}${d.risk?.flags?.length ? ` (${d.risk.flags.join(", ")})` : " — no flags"}`, tone: d.risk?.level === "High" ? "bad" : "ok" },
        ],
        result: ta
          ? `Support ${ta.support?.[0] != null ? price(ta.support[0]) : "–"} · Resistance ${ta.resistance?.[0] != null ? price(ta.resistance[0]) : "–"} · 1h stop ${price(ta.riskPlan?.long?.stop)}`
          : `${d.symbol} ${price(d.priceUsd)} · liquidity ${usd(d.liquidityUsd)}`,
      };
    },
  },
  {
    prompt: "Which tokens have momentum and low risk right now?",
    tool: "scan_tokens",
    args: { signal: "momentum", max_risk: "Low" },
    build: (d) => {
      const m = (d.matches ?? []) as { symbol: string; changePct: { h24: number }; liquidityUsd: number }[];
      return {
        steps: [
          { icon: "◐", text: `Scanned ${d.scanned} top Robinhood Chain tokens by volume`, tone: "tool" },
          { icon: "◑", text: "Filter: up on 1h, 6h and 24h · risk level Low", tone: "tool" },
          { icon: "✦", text: m.length ? `${m.length} match${m.length === 1 ? "" : "es"}: ${m.slice(0, 3).map((x) => `${x.symbol} ${pct(x.changePct.h24)}`).join(" · ")}` : "No token passes both filters right now", tone: "think" },
          { icon: "✓", text: m.length ? `Deepest pool: ${[...m].sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0].symbol}` : "Nothing forced — sometimes the answer is wait", tone: "ok" },
        ],
        result: m.length ? `${m.length} low-risk momentum token${m.length === 1 ? "" : "s"} found live` : "No low-risk momentum setups at this moment",
      };
    },
  },
  {
    prompt: "Any new launches? Check the rug risk",
    tool: "get_new_launches",
    args: {},
    build: (d) => {
      const list = (Array.isArray(d) ? d : []) as { symbol: string; liquidityUsd: number; risk: { level: string } }[];
      const high = list.filter((t) => t.risk.level === "High").length;
      const safest = [...list].filter((t) => t.risk.level !== "High").sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0];
      return {
        steps: [
          { icon: "◐", text: `Pulled the ${list.length} newest pools on chain 4663`, tone: "tool" },
          { icon: "◑", text: "Checked liquidity, pool age, buyers, copycats", tone: "tool" },
          { icon: "✦", text: `${high} of ${list.length} flagged High risk`, tone: high > list.length / 2 ? "bad" : "think" },
          { icon: "✓", text: safest ? `Deepest pool not flagged High: ${safest.symbol} · ${usd(safest.liquidityUsd)}` : "Every new pool is high risk right now", tone: "ok" },
        ],
        result: `${list.length - high} of ${list.length} new pools pass basic safety checks`,
      };
    },
  },
];

const toneClass: Record<Line["tone"], string> = { ok: "text-emerald-400", think: "text-violet", tool: "text-amber", bad: "text-rose-400" };

export function AgentDemo() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [steps, setSteps] = useState<Line[]>([]);
  const [visible, setVisible] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cache = useRef(new Map<number, { steps: Line[]; result: string; at: number }>());

  useEffect(() => {
    const s = SCENARIOS[idx];
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));
    setTyped("");
    setSteps([]);
    setVisible(0);
    setResult(null);
    setFailed(false);

    // fetch real data while the prompt is being "typed"
    const hit = cache.current.get(idx);
    const dataP: Promise<{ steps: Line[]; result: string } | null> =
      hit && Date.now() - hit.at < 120_000
        ? Promise.resolve(hit)
        : fetch("/api/tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: s.tool, args: s.args }) })
            .then((r) => r.json())
            .then((j) => {
              if (j.error) return null;
              const built = s.build(j.data, j.summary);
              cache.current.set(idx, { ...built, at: Date.now() });
              return built;
            })
            .catch(() => null);

    let t = 300;
    for (let i = 1; i <= s.prompt.length; i++) {
      at(t, () => setTyped(s.prompt.slice(0, i)));
      t += 26;
    }
    const typedAt = t;
    dataP.then((built) => {
      if (cancelled) return;
      const start = Math.max(0, typedAt - 0) + 400;
      if (!built) {
        at(start, () => setFailed(true));
        at(start + 4000, () => setIdx((v) => (v + 1) % SCENARIOS.length));
        return;
      }
      setSteps(built.steps);
      let tt = start;
      built.steps.forEach((_, i) => {
        at(tt, () => setVisible(i + 1));
        tt += 750;
      });
      at(tt, () => setResult(built.result));
      at(tt + 3200, () => setIdx((v) => (v + 1) % SCENARIOS.length));
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [idx]);

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="relative overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-white/10" />
          <span className="h-3 w-3 rounded-full bg-white/10" />
          <span className="h-3 w-3 rounded-full bg-white/10" />
          <span className="ml-3 font-mono text-xs text-muted">strix · live agent session</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            live data
          </span>
        </div>

        <div className="space-y-5 p-5 text-left sm:p-7">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-xs">You</div>
            <p className="min-h-[1.5rem] text-[15px] text-white sm:text-base">
              {typed}
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-amber" />
            </p>
          </div>

          <ul className="min-h-[7.5rem] space-y-2.5 border-l border-line pl-5 font-mono text-[12px] sm:ml-3.5 sm:text-[13px]">
            {failed && <li className="text-zinc-500">Data feed busy — retrying with the next question…</li>}
            {!failed && steps.length === 0 && typed === SCENARIOS[idx].prompt && (
              <li className="flex items-center gap-3 text-zinc-500">
                <span className="animate-pulse text-amber">◐</span>
                Calling {SCENARIOS[idx].tool} on live Robinhood Chain data…
              </li>
            )}
            {steps.map((step, i) => (
              <li
                key={`${idx}-${i}`}
                className={`flex items-start gap-3 transition-all duration-500 ${i < visible ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"}`}
              >
                <span className={toneClass[step.tone]}>{step.icon}</span>
                <span className="text-zinc-300">{step.text}</span>
              </li>
            ))}
          </ul>

          <div
            className={`flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm transition-all duration-500 ${
              result ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="text-emerald-400">●</span>
            <span className="text-emerald-100/90">{result ?? "…"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
