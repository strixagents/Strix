import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { CopyCode } from "@/components/CopyCode";
import { COMMANDS } from "@/components/commands";
import { TOOLS } from "@/lib/agent";
import { GROUPS } from "@/lib/contract";
import { INTERVALS, RISKS, SIGNALS } from "@/lib/rhchain";

export const metadata: Metadata = {
  title: "Strix Docs — agent, analyst, CLI, MCP & API",
  description: "How to use Strix, the AI agent for Robinhood Chain: the web agent, slash commands, safety checks, Contract X-ray, Rug Radar, the CLI, the MCP server and the HTTP API.",
};

const SECTIONS = [
  ["overview", "Overview"],
  ["agent", "Web agent"],
  ["commands", "Slash commands"],
  ["actions", "Actions & watchlist"],
  ["vision", "Reading screenshots"],
  ["tools", "Agent tools"],
  ["safety", "Safety system"],
  ["contract", "Contract X-ray"],
  ["radar", "Rug Radar"],
  ["smart", "Smart money"],
  ["cli", "CLI"],
  ["mcp", "MCP server"],
  ["api", "HTTP API"],
  ["data", "Data & limits"],
] as const;

const WEB_ONLY = new Set(["get_my_watchlist", "set_price_alert", "manage_watchlist", "follow_wallet"]);

const CLI_COMMANDS: [string, string][] = [
  ['strix ask "<question>"', "Ask the AI agent anything"],
  ["strix overview", "Chain stats, top tokens, gainers & losers"],
  ["strix analyze <token> [--interval 1h]", "On-chain stats + technicals + levels"],
  ["strix safe <token>", "Safety scorecard (A–F)"],
  ["strix contract <token|0x…>", "Contract X-ray: mint, blacklist, pause, upgrades, owner"],
  ["strix compare <A> <B> [C] [D]", "Side-by-side: liquidity, volume, age, risk"],
  ["strix whales <token>", "Whale buys/sells, top wallets, wash-trading check"],
  ["strix scan [--list top|trending|new] [--signal momentum] [--max-risk Low]", "Scan tokens by signal and risk"],
  ["strix new", "Newest pools with risk flags"],
  ["strix stocks [ticker]", "Stock tokens vs the real share price"],
  ["strix wallet <0x…>", "Wallet holdings, risk, spam filter and 24h trades"],
  ["strix search <name|symbol>", "Find a token / pool"],
  ["strix radar [type]", "Rug Radar events"],
  ["strix smart [pnl|volume|trades]", "Smart-money leaderboard (bots removed)"],
  ["strix news [topic]", "Robinhood Chain headlines"],
];

const API: [string, string, string][] = [
  ["GET", "/api/network", "Chain ID, latest block, gas price"],
  ["GET", "/api/overview", "Top tokens, trending, gainers/losers and chain totals"],
  ["GET", "/api/screener?list=top|trending|new", "Token rows with signals and risk"],
  ["GET", "/api/search?q=PONS", "Find tokens / pools by symbol, name or address"],
  ["GET", `/api/candles?pool=0x…&interval=${INTERVALS.join("|")}`, "OHLCV candles + indicator analysis"],
  ["GET", "/api/analyst?pool=0x…", "Scorecard, holders, whales, large transfers, contract scan"],
  ["GET", "/api/contract?token=PONS|0x…", "Contract X-ray (40 / min per IP)"],
  ["GET", "/api/price?pools=0x…,0x…", "Latest USD price per pool (max 30)"],
  ["GET", "/api/stocks", "Stock tokens vs real share prices"],
  ["GET", "/api/wallet?address=0x…", "Wallet scan (20 / min per IP)"],
  ["GET", "/api/radar", "Rug Radar events"],
  ["GET", "/api/smart-money", "Smart-money leaderboard"],
  ["GET", "/api/tool", "List of agent tools (JSON schema)"],
  ["POST", "/api/tool", "Run one tool: {\"name\":\"scan_contract\",\"args\":{\"token\":\"PONS\"}} (60 / min per IP)"],
  ["POST", "/api/agent", "Ask the agent; streams NDJSON events (20 / 10 min per IP)"],
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 border-t border-line pt-10 text-2xl font-semibold tracking-tight first:border-0 first:pt-0">
      <a href={`#${id}`} className="hover:underline">{children}</a>
    </h2>
  );
}
const P = ({ children }: { children: React.ReactNode }) => <p className="mt-3 leading-relaxed text-zinc-300">{children}</p>;
const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">{children}</code>;

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2 text-zinc-300">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  const tools = TOOLS.map((t) => t.function);
  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-8 sm:py-12">
        <aside className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-52 shrink-0 overflow-y-auto lg:block">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-muted">Docs</div>
          <nav className="space-y-0.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded-md px-2 py-1.5 text-zinc-400 transition hover:bg-white/[0.04] hover:text-white">{label}</a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-10 pb-24">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted">Documentation</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Strix Docs</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">Everything the agent can do, how it decides what is risky, and how to use it from the browser, your terminal and MCP clients.</p>
            <div className="mt-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-zinc-400 hover:text-white">{label}</a>
              ))}
            </div>
          </div>

          <section>
            <H id="overview">Overview</H>
            <P>
              Strix is an on-chain AI agent for <b>Robinhood Chain</b> (Arbitrum Orbit L2, chain ID 4663) with a built-in analyst. You ask a question in plain English; the agent decides which of its
              {" "}{tools.length} live tools to run, reads real chain and market data, and explains what it found. The same agent is available in the browser, as a CLI and as an MCP server.
            </P>
            <P>Strix is a research agent: it explains data and risk, and never gives buy/sell calls, entries, stops or targets. Nothing here is financial advice.</P>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[["/agent", "Agent", "Full-page AI agent"], ["/app", "Analyst", "Chart + agent + safety panel"], ["/radar", "Rug Radar", "Live red-flag feed"]].map(([h, t, d]) => (
                <Link key={h} href={h} className="rounded-xl border border-line bg-white/[0.02] p-4 transition hover:border-white/25">
                  <div className="font-medium">{t} →</div>
                  <div className="mt-1 text-sm text-muted">{d}</div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <H id="agent">Web agent</H>
            <P>
              Open <Link href="/agent" className="underline">/agent</Link> (or the panel next to the chart in the <Link href="/app" className="underline">Analyst</Link>). Answers stream in as they are written; every tool the agent
              runs is shown as a step, and its result appears as a live data card (token, safety grade, whales, wallet, contract, radar, comparison). Click a card to open the token in the Analyst.
            </P>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-zinc-300">
              <li>In the Analyst, the agent knows which token is on the chart — “is this safe?” means that token.</li>
              <li>After each answer you get up to three follow-up questions based on what was checked.</li>
              <li>Voice input (mic button) uses your browser’s speech recognition where available.</li>
              <li>Chat history stays in your browser; <b>New</b> starts over.</li>
              <li>If the free AI tiers are busy, Strix answers in rule-based mode from the same live data.</li>
            </ul>
          </section>

          <section>
            <H id="commands">Slash commands</H>
            <P>Type <C>/</C> in the chat to open the menu. Commands that take a token use the token on the chart when you leave it out.</P>
            <Table head={["Command", "Argument", "What it does"]} rows={COMMANDS.map((c) => [<C key="c">{c.cmd}</C>, c.arg ? <span className="font-mono text-xs text-muted">{c.arg}</span> : "—", c.hint])} />
          </section>

          <section>
            <H id="actions">Actions & watchlist</H>
            <P>The agent can act for you — just ask:</P>
            <Table
              head={["Say", "What happens"]}
              rows={[
                ["“Alert me if PONS drops 10%”", "Creates a price alert at the computed level; fires with a sound and a browser notification"],
                ["“Watch CASHCAT” · “remove CASHCAT”", "Adds / removes the token on your watchlist"],
                ["“Follow 0x…”", "Follows a wallet — it shows up on the Wallet page and in briefings"],
                [<C key="b">/brief</C>, "Personal briefing: your watchlist with live prices, distance to each alert, Rug Radar and the chain today"],
              ]}
            />
            <P>
              There are no accounts: the watchlist, alerts and followed wallets are saved <b>in your browser</b> (another browser or device starts empty). Alerts are checked every minute on live prices while
              any Strix tab is open. These actions are web-only — the CLI and MCP server answer that they live in the web app.
            </P>
          </section>

          <section>
            <H id="vision">Reading screenshots</H>
            <P>
              Attach a screenshot with the 📎 button, paste it (Ctrl/⌘+V) or drop it on the chat box — a tweet, a Telegram shill, a chart, a wallet or an explorer page. A free Gemini vision model reads the
              token symbols, addresses, claims and numbers in it; the agent then tells you what it read and checks each item with its normal tools, comparing claims like “liquidity locked” or “renounced” with
              the real on-chain data.
            </P>
            <P>Images are downscaled in your browser before sending. Vision models can misread small or blurry text, so the agent always states what it read; partly unreadable addresses are reported, never guessed.</P>
          </section>

          <section>
            <H id="tools">Agent tools</H>
            <P>The full list the agent can choose from (also exposed by <C>GET /api/tool</C>). Tools marked <i>web</i> act on your browser state and are not available to the CLI / MCP.</P>
            <Table
              head={["Tool", "Description"]}
              rows={tools.map((t) => [
                <span key="n" className="whitespace-nowrap font-mono text-xs text-zinc-200">{t.name}{WEB_ONLY.has(t.name) ? <span className="ml-1.5 rounded bg-amber/15 px-1 text-[10px] text-amber">web</span> : null}</span>,
                t.description,
              ])}
            />
          </section>

          <section>
            <H id="safety">Safety system</H>
            <P><b>Quick risk level.</b> Every token gets Low / Medium / High from live pool data. Each flag adds weight to a risk score:</P>
            <Table head={["Flag", "Meaning", "Weight"]} rows={Object.values(RISKS).map((r) => [r.label, r.hint, String(r.w)])} />
            <P>
              <b>A–F safety scorecard.</b> The deeper check (<C>/safe</C>, the Analyst panel) combines honeypot status, the original-vs-copycat check, liquidity, pool age, holders, top-10 concentration,
              developer holding, GeckoTerminal trust score, socials, wash-trading detection, whale flow and the Contract X-ray. Each failed check costs 22 points and each warning 7, from 100: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F below.
            </P>
            <P><b>Signals</b> are mechanical rules on the same data — a starting point for research, not buy/sell calls:</P>
            <Table head={["Signal", "Rule"]} rows={Object.values(SIGNALS).map((s) => [s.label, s.hint])} />
          </section>

          <section>
            <H id="contract">Contract X-ray</H>
            <P>
              Strix reads the token’s deployed bytecode straight from the Robinhood Chain RPC — no source code or third-party scanner. It extracts the function selectors from the contract’s dispatcher and
              matches them against known admin signatures, follows proxies (EIP-1967, beacon, EIP-1167) to the real logic, finds who can upgrade them, and reads the owner.
            </P>
            <Table head={["Power", "Why it matters", "Severity"]} rows={GROUPS.map((g) => [g.label, g.what, g.severity])} />
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-zinc-300">
              <li><b>Upgradeable proxy</b> with an active upgrader is high severity — the code can be swapped.</li>
              <li>A power only counts when an active owner or admin role still holds it; renounced ownership turns it into info.</li>
              <li>Official Robinhood stock tokens, stablecoins and WETH are marked <i>issuer-managed</i>: minting, pausing or upgrades are expected there.</li>
              <li>Limits: matching is by function name, so a custom-named admin function can be missed, and a capability is not proof of abuse.</li>
            </ul>
          </section>

          <section>
            <H id="radar">Rug Radar</H>
            <P>A background watcher scans the top, trending and newest pools every 2 minutes and records:</P>
            <Table
              head={["Event", "Rule"]}
              rows={[
                ["Liquidity pulled", "Pool liquidity below 50% of its high from the last hour (high was at least $20K)"],
                ["Price crash", "Price below 50% of its high from the last hour, or −50% over 1h when first seen (pool liquidity ≥ $1K)"],
                ["Supply minted", "New tokens minted from the zero address worth ≥ 2% of total supply, read from chain logs (stock tokens, WETH and stablecoins excluded)"],
                ["Copycat launch", "A pool younger than 24h whose symbol belongs to an older token"],
              ]}
            />
            <P>History starts when the server starts (shown as “monitoring since”). An alert is a warning sign, not proof of fraud.</P>
          </section>

          <section>
            <H id="smart">Smart money</H>
            <P>
              Built from DEX trades of $250+ over ~24h on the most liquid established pools. Per wallet, PnL = sold − bought + remaining tokens at the current price. Wallets need at least 2 trades and $1K
              volume; addresses with more than 50,000 transactions (bots / relayers) are removed and those above 10,000 are labelled <i>automated</i>. A short window favours active traders.
            </P>
          </section>

          <section>
            <H id="cli">CLI</H>
            <P>The CLI talks to a running Strix server and uses the same tools as the web agent.</P>
            <CopyCode
              code={`git clone https://github.com/strixagents/Strix
cd Strix && npm install && npm link
cp .env.example .env.local     # add a free Groq key for "strix ask"
npm run dev -- -p 3001         # the CLI talks to this server`}
            />
            <Table head={["Command", "What it does"]} rows={CLI_COMMANDS.map(([c, d]) => [<C key="c">{c}</C>, d])} />
            <P>
              Options: <C>--json</C> raw JSON for scripts, <C>--no-color</C> plain text, <C>STRIX_URL</C> server URL (default <C>http://localhost:3001</C>).
            </P>
          </section>

          <section>
            <H id="mcp">MCP server</H>
            <P>Use Strix as a tool inside Claude Code or any MCP client. With the Strix server running, register it like this:</P>
            <CopyCode
              title=".mcp.json"
              code={`{
  "mcpServers": {
    "strix": {
      "command": "node",
      "args": ["bin/strix-mcp.mjs"],
      "env": { "STRIX_URL": "http://localhost:3001" }
    }
  }
}`}
            />
            <P>
              It exposes the read-only tools: {tools.filter((t) => !WEB_ONLY.has(t.name)).map((t) => t.name).join(", ")}.
            </P>
          </section>

          <section>
            <H id="api">HTTP API</H>
            <P>All endpoints return JSON and are read-only. Please be gentle — they share free upstream quotas.</P>
            <Table head={["Method", "Endpoint", "Returns"]} rows={API.map(([m, e, d]) => [<span key="m" className="font-mono text-xs text-muted">{m}</span>, <C key="e">{e}</C>, d])} />
            <CopyCode code={`curl "http://localhost:3001/api/contract?token=PONS"

curl -X POST http://localhost:3001/api/tool \\
  -H "content-type: application/json" \\
  -d '{"name":"get_token_scorecard","args":{"token":"PONS"}}'`} />
            <P>
              <C>POST /api/agent</C> takes <C>{`{"messages":[{"role":"user","content":"Is PONS safe?"}]}`}</C> and streams one JSON event per line: <C>step</C>, <C>step_done</C>, <C>card</C>,
              {" "}<C>delta</C> (answer text as it is written), <C>answer</C>, <C>followups</C> and <C>meta</C>.
            </P>
          </section>

          <section>
            <H id="data">Data & limits</H>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-zinc-300">
              <li><b>Robinhood Chain RPC</b> — blocks, gas, balances (Multicall3), transfer and mint logs, contract bytecode. If an ISP blocks the RPC hostname, Strix resolves it over DNS-over-HTTPS.</li>
              <li><b>GeckoTerminal</b> — pools, candles, trades, holders and token info.</li>
              <li><b>DexScreener</b> — live pair prices and search.</li>
              <li><b>Yahoo Finance</b> — real share prices for the stock-token comparison.</li>
              <li><b>Google News RSS</b> — headlines.</li>
              <li><b>Groq</b> (primary) and <b>Google Gemini</b> (backup + screenshots) — free AI tiers.</li>
            </ul>
            <P>
              Coverage: tokens with a DEX pool indexed by GeckoTerminal or DexScreener. Free tiers have rate limits, so very busy moments can slow lists down or put the agent in rule-based mode. Everything shown
              is live data — no sample or demo data.
            </P>
            <P>Questions? See the <Link href="/#faq" className="underline">FAQ</Link> or the <a href="https://github.com/strixagents/Strix" target="_blank" rel="noreferrer" className="underline">GitHub repo</a>.</P>
          </section>
        </main>
      </div>
    </div>
  );
}
