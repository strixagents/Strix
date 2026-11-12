import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { AgentChat } from "@/components/terminal/AgentChat";
import { Logo } from "@/components/Logo";
import { FaqItem, Reveal } from "@/components/Interactive";
import { Frame, SectionTitle } from "@/components/landing/Frame";
import { LiveCarousel } from "@/components/landing/LiveCarousel";
import { HeroOrbit, ScaledOrbit } from "@/components/landing/HeroOrbit";
import { Aurora } from "@/components/landing/Aurora";
import { LiveAgentPanel, MiniScreener, LiveChainPulse, LiveRiskCheck, StatusDot } from "@/components/landing/Widgets";

const faqs = [
  {
    q: "Which tokens does Strix cover?",
    a: "Tokens with a DEX pool on Robinhood Chain (chain ID 4663): memecoins, launchpad tokens, and tokenized stocks like NVDA traded against WETH or USDG. The most active pools are tracked automatically; any other token can be found by symbol or contract address, as long as GeckoTerminal or DexScreener index its pool.",
  },
  {
    q: "Is the data real?",
    a: "Yes. Pools, prices, volume, liquidity and candles come live from GeckoTerminal and DexScreener. Wallet balances, transfers, contract bytecode, block height and gas come straight from the Robinhood Chain RPC. Real stock prices for the stock-token comparison come from Yahoo Finance. Every indicator is computed on our server from those numbers.",
  },
  {
    q: "How does the risk score work?",
    a: "Every token gets a quick Low / Medium / High risk level from live pool data (thin liquidity, very new pool, FDV far above liquidity, extreme moves, few buyers, heavy selling, copycat symbols, fake liquidity, disguised names, wash volume). The full A–F safety scorecard adds holders, top-10 concentration, developer holding, whale and wash-trading checks, and a Contract X-ray that reads the token bytecode for mint, blacklist, pause, tax and upgrade powers. It is a warning system, not a guarantee.",
  },
  {
    q: "Can I use the agent outside the browser?",
    a: "Yes. The same agent and the same live tools are available as a CLI (strix ask, strix radar, strix wallet…) and as an MCP server for Claude Code and other MCP clients. Source and setup are on GitHub.",
  },
  { q: "Does Strix tell me what to buy?", a: "No. Strix is a research agent: it reads on-chain data, checks the risk and explains what it finds. It never gives buy/sell calls, entries or targets. Nothing here is financial advice." },
];

// only services Strix actually reads data from
const sources = ["Robinhood Chain RPC", "GeckoTerminal", "DexScreener", "Yahoo Finance", "Google News"];

const pills = [
  { icon: "✦", t: "AI Agent" },
  { icon: "🛡", t: "Safety scorecard" },
  { icon: "🐋", t: "Whale tracker" },
  { icon: "👛", t: "Wallet scanner" },
  { icon: "🚨", t: "Rug Radar" },
  { icon: "🧠", t: "Smart money" },
  { icon: ">_", t: "CLI" },
  { icon: "⧉", t: "MCP server" },
];

export default function Home() {
  return (
    <div className="relative bg-ink">
      {/* ───── aurora behind navbar + hero (full width, fades out downward) ───── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0,#000_8%,#000_50%,transparent_100%)] sm:h-[980px]" aria-hidden>
        <Aurora className="h-full w-full" />
      </div>

      {/* ───── announcement bar ───── */}
      <Link
        href="/agent"
        className="relative z-10 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-[#0d0d0d]/60 px-5 py-3.5 text-[15px] backdrop-blur-md sm:px-8"
      >
        <span className="leading-snug text-white">
          New: the full-page Strix Agent.
          <span className="block text-zinc-300 sm:inline"> Rug Radar, smart money, wallets and the safety scorecard are now tools it runs for you — in the browser, the CLI or MCP.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted">
          Try it <span aria-hidden>→</span>
        </span>
      </Link>

      <Navbar />

      <main className="relative overflow-x-clip">
        {/* ───── hero ───── */}
        <section className="relative mx-auto max-w-6xl px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-28">
          {/* orbit: full size on wide screens, scaled on laptops, centered under the CTA on phones */}
          <div className="pointer-events-none absolute -right-10 top-[330px] z-0 hidden xl:block 2xl:-right-24">
            <HeroOrbit />
          </div>
          <div className="pointer-events-none absolute right-2 top-[360px] z-0 hidden lg:block xl:hidden">
            <ScaledOrbit scale={0.64} />
          </div>
          <Reveal>
            <h1 className="max-w-4xl text-[2.85rem] font-semibold leading-[1] tracking-[-0.035em] sm:text-7xl lg:text-8xl">
              The AI agent for Robinhood Chain.
            </h1>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:mt-8 sm:text-2xl">
              An on-chain AI agent with a built-in analyst. Ask in plain English — or from your CLI and MCP client — and Strix reads the chain live, checks the rug risk and explains what it finds.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-10 grid gap-3 sm:flex">
              <Link href="/agent" className="btn-primary px-7 py-3.5 text-base sm:py-4 sm:text-lg">
                Talk to the agent <span aria-hidden>→</span>
              </Link>
              <Link href="/app" className="btn-secondary px-7 py-3.5 text-base sm:py-4 sm:text-lg">
                Open the analyst
              </Link>
            </div>
            <ScaledOrbit scale={0.66} className="pointer-events-none mx-auto mt-12 lg:hidden" />
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-12 text-xs uppercase tracking-widest text-[#555] sm:mt-16">Live data from</div>
            <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3 text-base font-semibold tracking-tight text-[#6d6d6d] sm:gap-x-12 sm:text-xl">
              {sources.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={300} className="mt-16">
            <div className="card-dark p-3 sm:p-5">
              {/* the real agent — same API, tools and limits as /agent, not a recording */}
              <div className="mx-auto h-[600px] max-w-3xl overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#111] sm:h-[640px]">
                <AgentChat />
              </div>
            </div>
          </Reveal>
        </section>

        {/* ───── live market stories ───── */}
        <section className="px-5 py-10 sm:px-8 sm:py-16">
          <Reveal>
            <LiveCarousel />
          </Reveal>
        </section>

        {/* ───── feature sections ───── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-24 space-y-20 px-5 py-16 sm:space-y-28 sm:px-8 sm:py-24">
          <div>
            <Reveal>
              <SectionTitle
                title={<>An agent that does<br className="hidden sm:block" /> the research</>}
                sub="Ask about any Robinhood Chain token. Strix picks the tools — safety scorecard, whales, wallets, chart — runs them on live data and explains what it found."
              />
            </Reveal>
            <Reveal>
              <Frame caption="Strix Agent">
                <LiveAgentPanel />
              </Frame>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <SectionTitle
                title="It watches the whole chain"
                sub="The agent's screener tool tracks the most active pools for volume spikes, buy pressure and fresh launches — with a risk score on every row."
              />
            </Reveal>
            <Reveal>
              <Frame caption="Screener">
                <MiniScreener />
              </Frame>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <SectionTitle
                title={<>Spots rug risk<br className="hidden sm:block" /> before you do</>}
                sub="Thin liquidity, hours-old pools, FDV a hundred times the pool, one-sided selling — Strix flags it before your wallet finds out."
              />
            </Reveal>
            <Reveal>
              <Frame caption="Risk check">
                <LiveRiskCheck />
              </Frame>
            </Reveal>
          </div>

          <div>
            <Reveal>
              <SectionTitle
                title="The whole chain at a glance"
                sub="Live DEX volume, liquidity, block height and the hottest tokens on Robinhood Chain — one tap from a full analysis."
              />
            </Reveal>
            <Reveal>
              <Frame caption="Chain pulse">
                <LiveChainPulse />
              </Frame>
            </Reveal>
          </div>
        </section>

        {/* ───── everything you need ───── */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <Reveal>
            <SectionTitle center title={<>One agent,<br />three ways to use it</>} sub="The browser, your terminal and your MCP client — the same agent and the same live tools everywhere." />
          </Reveal>

          <div className="mt-16 space-y-6">
            <Reveal>
              <div className="card-dark overflow-hidden p-6 sm:p-10">
                <h3 className="text-2xl font-semibold tracking-tight sm:text-4xl">Talk to it from your terminal</h3>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-xl">
                  The Strix CLI and MCP server call the exact tools the web agent uses. Ask questions, scan wallets or check the Rug Radar without leaving your shell — or let Claude Code and other MCP clients use Strix as a tool.
                </p>
                <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                  <a href="https://github.com/strixagents/Strix" target="_blank" rel="noreferrer" className="btn-glow rounded-full bg-white px-7 py-3.5 text-lg font-medium text-black">
                    Get the CLI on GitHub
                  </a>
                  <Link href="/agent" className="flex items-center gap-2 text-lg text-white">
                    Or use it in the browser <span aria-hidden>→</span>
                  </Link>
                </div>
                <div className="relative mt-12 sm:ml-auto sm:max-w-xl">
                  <div className="rounded-t-xl border border-b-0 border-[#2a2a2a] bg-[#151515] font-mono text-[13px]">
                    <div className="flex items-center gap-1.5 border-b border-[#262626] px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                      <span className="ml-auto text-[11px] text-[#777]">strix — commands</span>
                    </div>
                    <div className="space-y-1.5 p-4 text-[#ccc]">
                      {[
                        ["strix ask \"Is PONS safe?\"", "AI agent with live tools"],
                        ["strix safe CASHCAT", "A–F safety scorecard"],
                        ["strix whales PONS", "whale flow, bots filtered"],
                        ["strix wallet 0x…", "holdings, risk, 24h trades"],
                        ["strix radar", "liquidity pulls, mints, copycats"],
                        ["strix smart", "most active real wallets"],
                      ].map(([c, d]) => (
                        <div key={c} className="flex flex-wrap gap-x-3">
                          <span><span className="text-emerald-400">$</span> {c}</span>
                          <span className="text-[#666]"># {d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="card-dark overflow-hidden p-6 sm:p-10">
                <h3 className="text-2xl font-semibold tracking-tight sm:text-4xl">Every tool the agent uses.</h3>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-xl">
                  Safety scorecard, whale tracker, wallet scanner, Rug Radar, smart money, screener and stock-token premiums — the agent runs them for you, and you can open each one yourself.
                </p>
                <Link href="/agent" className="mt-8 inline-flex items-center gap-2 text-lg text-white">
                  Talk to the agent <span aria-hidden>→</span>
                </Link>
                <div className="relative mt-8 h-80 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_20%,#000_80%,transparent)]">
                  <div className="flex animate-scroll-y flex-col items-center gap-4">
                    {[...pills, ...pills].map((p, i) => (
                      <div
                        key={i}
                        className="flex min-w-[240px] items-center gap-4 rounded-full border border-[#2a2a2a] bg-gradient-to-b from-[#262626] to-[#1a1a1a] px-7 py-4 text-xl text-white shadow-lg"
                        style={{ marginLeft: `${(i % 3) * 40 - 40}px` }}
                      >
                        <span className="w-7 text-center text-2xl">{p.icon}</span>
                        {p.t}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ───── stacked tiles ───── */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-24 md:grid-cols-2">
          <div className="relative mx-auto h-[420px] w-full max-w-sm scale-[0.85] [perspective:1200px] sm:scale-100">
            {[
              { top: 0, el: <Logo className="h-24 w-24 -rotate-0" mono /> },
              { top: 120, el: <span className="text-5xl font-semibold text-emerald-400">4663</span> },
              { top: 240, el: <span className="text-7xl font-semibold text-orange-500">σ</span> },
            ].map((t, i) => (
              <div key={i} className="absolute left-1/2 -translate-x-1/2" style={{ top: t.top }}>
                <div className="iso grid h-48 w-48 place-items-center rounded-3xl border border-white/10 bg-gradient-to-br from-[#2b2b2b] to-[#141414] shadow-[0_40px_60px_-20px_rgba(0,0,0,0.9)]">
                  <div className="[transform:rotateZ(45deg)]">{t.el}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-14">
            {[
              { t: "An agent, not a signal bot", d: "Strix researches and explains — liquidity, holders, whales, red flags. It never tells you what to buy or sell. You make the call." },
              { t: "Native to Robinhood Chain", d: "Chain 4663 RPC plus Uniswap, Pons and other DEX pools via GeckoTerminal and DexScreener, refreshed continuously." },
              { t: "Built on real math", d: "EMA, RSI, MACD, ATR and Bollinger computed from raw candles. No guessed prices." },
            ].map((x) => (
              <Reveal key={x.t}>
                <h3 className="text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">{x.t}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted sm:mt-4 sm:text-xl">{x.d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ───── FAQ ───── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24">
          <Reveal>
            <SectionTitle title="Questions, answered" />
          </Reveal>
          <Reveal>
            {faqs.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </Reveal>
        </section>

        {/* ───── final CTA ───── */}
        <section className="relative overflow-hidden px-5 py-20 text-center sm:px-8 sm:py-32">
          <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_70%_75%_at_50%_45%,#000_30%,transparent_75%)]" aria-hidden>
            <Aurora className="h-full w-full" intensity={0.8} scale={0.4} />
          </div>
          <Reveal className="relative">
            <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-6xl">
              One agent for Robinhood Chain — web, CLI and MCP. Free for everyone.
            </h2>
            <div className="mx-auto mt-10 grid max-w-xl gap-3 sm:mt-12 sm:grid-cols-2">
              <Link href="/app" className="btn-secondary px-4 py-4 text-lg">
                Open the analyst
              </Link>
              <Link href="/agent" className="btn-primary px-4 py-4 text-lg">
                Talk to the agent <span aria-hidden>→</span>
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ───── footer ───── */}
      <footer className="px-5 pt-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex items-center justify-between gap-4">
            <Logo className="h-11 w-11" />
            <div className="flex items-center gap-2.5">
              {[
                {
                  href: "https://x.com/strix_agents",
                  label: "Strix on X",
                  icon: <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
                },
                {
                  href: "https://github.com/strixagents/Strix",
                  label: "Strix on GitHub",
                  icon: <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />,
                },
              ].map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-[#2a2a2a] bg-white/[0.03] text-zinc-400 transition hover:border-white/30 hover:bg-white/[0.07] hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
                    {s.icon}
                  </svg>
                </a>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4">
            {[
              { h: "Agent", l: [["AI Agent", "/agent"], ["Analyst", "/app"], ["Rug Radar", "/radar"], ["Smart money", "/smart-money"], ["Wallet scanner", "/wallet"]] },
              { h: "Robinhood Chain", l: [["Screener", "/screener"], ["Stock tokens", "/stocks"], ["New pools", "/screener"], ["Explorer", "https://robinhoodchain.blockscout.com"]] },
              { h: "Developers", l: [["Docs", "/docs"], ["CLI & MCP", "/docs#cli"], ["GitHub", "https://github.com/strixagents/Strix"], ["X (Twitter)", "https://x.com/strix_agents"], ["FAQ", "/#faq"], ["Features", "/#features"]] },
              { h: "Data", l: [["GeckoTerminal", "https://www.geckoterminal.com/robinhood/pools"], ["DexScreener", "https://dexscreener.com/robinhood"], ["Blockscout", "https://robinhoodchain.blockscout.com"]] },
            ].map((c) => (
              <div key={c.h}>
                <div className="mb-4 text-lg text-white">{c.h}</div>
                <ul className="space-y-3 text-lg text-muted">
                  {c.l.map(([t, h]) => (
                    <li key={t}>
                      <Link href={h} {...(h.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})} className="flex items-center gap-2 transition hover:text-white">
                        {t}
                        {t === "AI Agent" && <span className="rounded-full bg-[#2a2a2a] px-2 py-0.5 text-xs text-zinc-300">NEW</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 border-t border-[#1f1f1f]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 py-8">
            <StatusDot />
            <span className="text-sm text-muted">© Strix {new Date().getFullYear()} · Not financial advice</span>
          </div>
        </div>
        <div className="select-none overflow-hidden pb-16 pt-8 text-center">
          <span className="neon text-[26vw] font-semibold leading-none sm:text-[16rem]">Strix</span>
        </div>
      </footer>
    </div>
  );
}
