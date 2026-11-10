import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { AgentDemo } from "@/components/AgentDemo";
import { Logo } from "@/components/Logo";
import { FaqItem, Reveal } from "@/components/Interactive";
import { Frame, SectionTitle } from "@/components/landing/Frame";
import { LiveCarousel } from "@/components/landing/LiveCarousel";
import { HeroOrbit, ScaledOrbit } from "@/components/landing/HeroOrbit";
import { LiveAgentPanel, LiveAlertPreview, MiniScreener, LiveChainPulse, LiveRiskCheck, StatusDot } from "@/components/landing/Widgets";
import { WalletButton } from "@/components/WalletButton";

const faqs = [
  {
    q: "Which tokens does Strix cover?",
    a: "Tokens with a DEX pool on Robinhood Chain (chain ID 4663): memecoins, launchpad tokens, and tokenized stocks like NVDA traded against WETH or USDG. The most active pools are tracked automatically; any other token can be found by symbol or contract address, as long as GeckoTerminal or DexScreener index its pool.",
  },
  {
    q: "Is the data real?",
    a: "Yes. Pools, prices, volume, liquidity and candles come live from GeckoTerminal and DexScreener. Wallet balances, transfers, block height and gas come straight from the Robinhood Chain RPC. Real stock prices for the stock-token comparison come from Yahoo Finance. Every indicator is computed on our server from those numbers.",
  },
  {
    q: "How does the risk score work?",
    a: "Strix flags low liquidity, very new pools, FDV far above liquidity, extreme moves, few unique buyers and heavy selling, then scores the token Low, Medium or High. It is a warning system, not a guarantee.",
  },
  {
    q: "Do I need to connect a wallet?",
    a: "No. Connecting is optional: it adds Robinhood Chain to your wallet and shows your ETH balance. Strix never asks you to sign a transaction.",
  },
  { q: "Which wallets does Strix support?", a: "Any injected EVM wallet such as MetaMask or Rabby. One click adds Robinhood Chain (chain ID 4663) to your wallet." },
  { q: "Does Strix tell me what to buy?", a: "No. Strix lays out data, scenarios and risk. You make the call. Nothing here is financial advice." },
];

const sources = ["Robinhood Chain", "GeckoTerminal", "DexScreener", "Uniswap", "Blockscout"];

const pills = [
  { icon: "🐸", t: "Memecoins" },
  { icon: "📈", t: "Tokenized stocks" },
  { icon: "🚀", t: "New pools" },
  { icon: "🛡", t: "Risk check" },
  { icon: "⌕", t: "Screener" },
  { icon: "🔔", t: "Price alerts" },
  { icon: "✦", t: "AI Agent" },
  { icon: "⛓", t: "Chain 4663" },
];

export default function Home() {
  return (
    <div className="bg-ink">
      {/* ───── announcement bar ───── */}
      <Link
        href="/stocks"
        className="flex items-center justify-between gap-4 border-b border-[#1f1f1f] bg-[#0d0d0d] px-5 py-3.5 text-[15px] sm:px-8"
      >
        <span className="leading-snug text-white">
          New: stock tokens vs the real stock, and a wallet scanner.
          <span className="block text-zinc-300 sm:inline"> See premiums on NVDA, TSLA, SPY and more — and what any wallet is buying.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted">
          Try it <span aria-hidden>→</span>
        </span>
      </Link>

      <Navbar />

      <main className="overflow-x-clip">
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
              The AI trading agent for Robinhood Chain.
            </h1>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:mt-8 sm:text-2xl">
              Strix reads Robinhood Chain pools live, does the math, flags the rug risk, and lays out clear scenarios — entry, stop and targets.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div className="mt-10 grid gap-3 sm:flex">
              <Link href="/app" className="btn-primary px-7 py-3.5 text-base sm:py-4 sm:text-lg">
                Get started for free <span aria-hidden>→</span>
              </Link>
              <Link href="/screener" className="btn-secondary px-7 py-3.5 text-base sm:py-4 sm:text-lg">
                Open the screener
              </Link>
            </div>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
              Free. No sign-up. Memecoins, launchpad tokens and tokenized stocks — all on-chain.
            </p>
            <WalletButton className="mt-5 inline-block" />
            <ScaledOrbit scale={0.66} className="pointer-events-none mx-auto mt-12 lg:hidden" />
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-base font-semibold tracking-tight text-[#6d6d6d] sm:mt-16 sm:gap-x-12 sm:text-xl">
              {sources.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={300} className="mt-16">
            <div className="card-dark p-3 [perspective:1600px] sm:p-5">
              <div className="origin-top transition-transform duration-700 [transform:rotateX(8deg)] hover:[transform:rotateX(0deg)]">
                <AgentDemo />
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
                title={<>The AI analyst you<br className="hidden sm:block" /> can trade with</>}
                sub="Ask about any Robinhood Chain token and get live context — trend, liquidity, buy/sell flow, key levels and risk — right next to your chart."
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
                title="Scan faster, trade sooner"
                sub="Scan the most active pools on the chain for momentum, volume spikes, buy pressure and fresh launches — with a risk score on every row."
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
                title={<>Spot rug risk<br className="hidden sm:block" /> before you ape in</>}
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
            <SectionTitle center title={<>Everything you need<br />to trade smarter</>} sub="One terminal to research, plan and track every trade." />
          </Reveal>

          <div className="mt-16 space-y-6">
            <Reveal>
              <div className="card-dark overflow-hidden p-6 sm:p-10">
                <h3 className="text-2xl font-semibold tracking-tight sm:text-4xl">Never miss a level again</h3>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-xl">
                  Set price alerts on any Robinhood Chain token. Strix watches the pool and pings you with a sound and a notification the moment price gets there.
                </p>
                <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-5">
                  <Link href="/app" className="btn-glow rounded-full bg-white px-7 py-3.5 text-lg font-medium text-black">
                    Set your first alert
                  </Link>
                  <Link href="/app" className="flex items-center gap-2 text-lg text-white">
                    Open the terminal <span aria-hidden>→</span>
                  </Link>
                </div>
                <div className="relative mt-12 sm:ml-auto sm:max-w-xl">
                  <div className="rounded-t-xl border border-b-0 border-[#2a2a2a] bg-[#151515] font-mono text-[13px]">
                    <div className="flex items-center gap-1.5 border-b border-[#262626] px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                      <span className="ml-auto text-[11px] text-[#777]">live prices · pick one to alert</span>
                    </div>
                    <LiveAlertPreview />
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="card-dark overflow-hidden p-6 sm:p-10">
                <h3 className="text-2xl font-semibold tracking-tight sm:text-4xl">One terminal for the whole chain.</h3>
                <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-xl">
                  Chart, AI agent, screener, risk check, alerts and position sizing — unified for Robinhood Chain.
                </p>
                <Link href="/app" className="mt-8 inline-flex items-center gap-2 text-lg text-white">
                  Explore the terminal <span aria-hidden>→</span>
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
              { t: "Where decisions happen", d: "Plan every trade with levels, stops, size and a risk score before you ape in — not after." },
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
        <section className="px-5 py-20 text-center sm:px-8 sm:py-32">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-6xl">
              Built for Robinhood Chain traders. Free for everyone.
            </h2>
            <div className="mx-auto mt-10 grid max-w-xl gap-3 sm:mt-12 sm:grid-cols-2">
              <Link href="/screener" className="btn-secondary px-4 py-4 text-lg">
                Open screener
              </Link>
              <Link href="/app" className="btn-primary px-4 py-4 text-lg">
                Start free <span aria-hidden>→</span>
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ───── footer ───── */}
      <footer className="px-5 pt-16 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Logo className="mb-12 h-11 w-11" mono />
          <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4">
            {[
              { h: "Product", l: [["Terminal", "/app"], ["Screener", "/screener"], ["AI Agent", "/app"], ["Price alerts", "/app"], ["Risk check", "/app"]] },
              { h: "Robinhood Chain", l: [["Top tokens", "/screener"], ["Trending", "/screener"], ["New pools", "/screener"], ["Explorer", "https://robinhoodchain.blockscout.com"]] },
              { h: "Resources", l: [["FAQ", "/#faq"], ["Features", "/#features"]] },
              { h: "Data", l: [["GeckoTerminal", "https://www.geckoterminal.com/robinhood/pools"], ["DexScreener", "https://dexscreener.com/robinhood"], ["Blockscout", "https://robinhoodchain.blockscout.com"]] },
            ].map((c) => (
              <div key={c.h}>
                <div className="mb-4 text-lg text-white">{c.h}</div>
                <ul className="space-y-3 text-lg text-muted">
                  {c.l.map(([t, h]) => (
                    <li key={t}>
                      <Link href={h} className="flex items-center gap-2 transition hover:text-white">
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
