/** Agent slash commands — shared by the chat and the docs page. A missing token arg falls back to the token on the chart. */
export const COMMANDS: { cmd: string; arg?: string; hint: string; build: (a: string) => string }[] = [
  { cmd: "/brief", hint: "Your watchlist, alerts, radar & the chain", build: () => "Brief me: my watchlist and alerts, anything on the Rug Radar that touches them, and how the chain is doing today" },
  { cmd: "/alert", arg: "token level", hint: "e.g. /alert PONS -10%  ·  /alert NVDA 190", build: (a) => `Set a price alert: ${a}` },
  { cmd: "/watch", arg: "token", hint: "Add a token to your watchlist", build: (a) => `Add ${a} to my watchlist` },
  { cmd: "/analyze", arg: "token", hint: "On-chain stats + chart context on 1h & 4h", build: (a) => `Analyze ${a} on 1h and 4h — on-chain stats, trend, key levels and risks` },
  { cmd: "/contract", arg: "token", hint: "X-ray the contract: mint, blacklist, pause, upgrades", build: (a) => `X-ray the ${a} contract — can the owner mint, blacklist, pause, change taxes or upgrade it? Is it renounced?` },
  { cmd: "/safe", arg: "token", hint: "A–F safety scorecard, honeypot, holders", build: (a) => `Is ${a} safe? Run the full safety scorecard and explain every red flag` },
  { cmd: "/whales", arg: "token", hint: "Whale buys/sells, wash-trading check", build: (a) => `Are whales buying or selling ${a}? Show the biggest wallets and check for wash trading` },
  { cmd: "/full", arg: "token", hint: "Everything: chart, safety and whales", build: (a) => `Full due diligence on ${a}: analyze the chart, run the safety scorecard and check whale activity, then give me the key takeaways` },
  { cmd: "/wallet", arg: "0x…", hint: "Holdings, risk and 24h trades of a wallet", build: (a) => `Scan wallet ${a} — holdings, risk and what it traded in the last 24h` },
  { cmd: "/radar", hint: "Live rugs, crashes, mints, copycats", build: () => "Any rugs, crashes, supply mints or copycats on the radar right now?" },
  { cmd: "/smart", hint: "Top traders, bots removed", build: () => "Who are the top traders on Robinhood Chain today (bots removed)? What are they trading?" },
  { cmd: "/new", hint: "Newest launches with risk", build: () => "Show the newest launches on Robinhood Chain and rank them by risk" },
  { cmd: "/stocks", arg: "ticker", hint: "Stock tokens vs the real share", build: (a) => `Compare ${a || "the stock tokens"} with the real share price — premium or discount?` },
  { cmd: "/compare", arg: "A B", hint: "Side-by-side token comparison", build: (a) => `Compare ${a.split(/[\s,]+/).filter(Boolean).join(" vs ")} — which is riskier and why?` },
];
