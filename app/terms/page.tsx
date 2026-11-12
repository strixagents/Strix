import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Terms & Disclaimer — Strix",
  description: "Strix is a research tool, not financial advice. How Strix handles your data, the limits of its safety checks, and the terms of use.",
};

const UPDATED = "November 12, 2026";

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:py-14">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted">Legal</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Terms & Disclaimer</h1>
          <p className="mt-3 text-sm text-muted">Last updated {UPDATED}</p>
        </div>

        <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] p-5 text-sm leading-relaxed text-amber">
          <b>Not financial advice.</b> Strix is a research tool. It explains on-chain data and risk; it never tells you what to buy or sell. Crypto assets are
          highly risky and you can lose everything you put in. Do your own research and only risk what you can afford to lose.
        </div>

        <S title="What Strix is">
          <p>
            Strix is a free, open-source AI agent for Robinhood Chain (chain ID 4663). It reads public blockchain and market data, runs automated checks and
            uses AI models to explain the results — on this website, through a command-line tool and through an MCP server.
          </p>
        </S>

        <S title="No advice, no guarantees">
          <ul className="list-disc space-y-2 pl-5">
            <li>Nothing on Strix is investment, financial, legal or tax advice, or an offer or recommendation to buy or sell any asset.</li>
            <li>
              Safety grades, the Contract X-ray, the Rug Radar and risk flags are <b>warning systems, not guarantees</b>. A token that passes every check can still
              lose value, be abandoned or turn out to be a scam; a flagged token is not proof of fraud.
            </li>
            <li>The Contract X-ray matches known admin function names in a contract’s bytecode — a custom-named admin function can be missed.</li>
            <li>AI answers can be wrong or incomplete. Always check the underlying data and the contract address yourself.</li>
          </ul>
        </S>

        <S title="Data sources and accuracy">
          <p>
            Strix shows live data from the Robinhood Chain RPC, GeckoTerminal, DexScreener, Yahoo Finance and Google News. These are third-party services:
            data can be delayed, incomplete or wrong, and Strix cannot guarantee its accuracy or availability. Free service limits may slow Strix down or
            switch the agent to a rule-based report.
          </p>
        </S>

        <S title="Your data">
          <ul className="list-disc space-y-2 pl-5">
            <li><b>No accounts.</b> Strix has no sign-up and never asks for your name, email, seed phrase or private keys.</li>
            <li><b>Stored in your browser.</b> Your watchlist, price alerts, followed wallets and chat history are saved in your browser’s local storage, on your device only. Clearing your browser data removes them.</li>
            <li>
              <b>Sent to answer you.</b> Questions you ask the agent are processed on our server and sent to AI providers (Groq and Google Gemini) to generate an
              answer. Screenshots you attach are sent to Google Gemini to read them. Those providers handle the data under their own terms.
            </li>
            <li><b>Abuse protection.</b> To limit abuse, the server keeps short-lived request counters keyed by IP address in memory; they are not stored or shared.</li>
            <li><b>Infrastructure.</b> The site is hosted on Railway with DNS by Cloudflare; like any website, these providers may process request data (such as IP addresses) to deliver it.</li>
            <li>Strix does not sell your data and does not use advertising trackers.</li>
          </ul>
        </S>

        <S title="Wallets and transactions">
          <p>
            Strix only reads public blockchain data. It never asks you to connect a wallet, sign a transaction or approve a token, and it cannot move funds.
            Anyone asking you to do so “for Strix” is not us.
          </p>
        </S>

        <S title="Acceptable use">
          <p>
            Don’t abuse the service — for example by overloading the API, trying to break or bypass rate limits, or using Strix to harass others. We may limit
            or block access that harms the service for other people.
          </p>
        </S>

        <S title="Open source">
          <p>
            Strix’s code is published under the{" "}
            <a href="https://github.com/strixagents/Strix/blob/main/LICENSE" target="_blank" rel="noreferrer" className="underline">MIT License</a>. The service is
            provided “as is”, without warranty of any kind, and to the extent permitted by law we are not liable for any loss arising from its use.
          </p>
        </S>

        <S title="Changes and contact">
          <p>
            We may update these terms as Strix evolves; the date at the top shows the latest version. Questions or concerns: reach us on{" "}
            <a href="https://x.com/strix_agents" target="_blank" rel="noreferrer" className="underline">X @strix_agents</a> or open an issue on{" "}
            <a href="https://github.com/strixagents/Strix/issues" target="_blank" rel="noreferrer" className="underline">GitHub</a>.
          </p>
          <p>
            <Link href="/" className="underline">Back to Strix</Link>
          </p>
        </S>
      </main>
    </div>
  );
}
