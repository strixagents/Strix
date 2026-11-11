<p align="center"><img src="brand/banner.png" alt="Strix — the AI agent for Robinhood Chain" width="100%"></p>

# Strix

**The AI agent for Robinhood Chain (chain ID 4663)** — an on-chain agent with a built-in analyst, usable from the web, the CLI and any MCP client. Rug-risk checks, whale and wallet tracking, Rug Radar, stock-token premiums and live charts — all from real on-chain and market data.

> Research tool only. Nothing here is financial advice.

## Features

| | |
|---|---|
| **Agent** (`/agent`) | Full-page AI agent: streams answers, runs live tools (scorecard, whales, wallets, Rug Radar, smart money…), shows data cards, slash commands and follow-up questions |
| **Analyst** (`/app`) | Candlestick charts (EMA 20/50/200, auto support/resistance), on-chain stats (liquidity, FDV, buys/sells, pool age), price alerts — with the agent docked beside the chart |
| **AI agent** | Ask in plain language — it calls live tools and explains the result. Groq primary, Google Gemini backup, rule-based fallback |
| **Analyst panel** | A–F safety scorecard (honeypot, copycat, liquidity, holders, top-10 concentration, dev holding, wash trading), whale flow with bot/relayer detection, holder distribution |
| **Screener** (`/screener`) | Top / trending / new pools with on-chain signals and risk scores |
| **Stocks** (`/stocks`) | Official Robinhood stock tokens vs the real share price — premium/discount, lookalike tokens flagged |
| **Wallet** (`/wallet`) | Any wallet's holdings with risk per token, fake-airdrop filter, 24h buys/sells (smart money), follow list |
| **Smart money** (`/smart-money`) | Wallets ranked by ~24h PnL, volume or activity on the most liquid tokens — bots and relayers removed, automated wallets labelled |
| **Rug Radar** (`/radar`) | Background watcher: liquidity pulls, price crashes, sudden supply mints (read from chain logs) and copycat launches |
| **CLI** | `strix ask`, `analyze`, `safe`, `whales`, `scan`, `new`, `stocks`, `wallet`, `smart`, `radar`, `news` |
| **MCP server** | Use every Strix tool from Claude Code or any MCP client |

## Data sources (all free)

- **Robinhood Chain RPC** — blocks, gas, wallet balances (Multicall3), transfers
- **GeckoTerminal** — pools, candles, trades, holders (optional free CoinGecko Demo key for higher limits)
- **DexScreener** — live pair prices, search
- **Yahoo Finance** — real stock prices for the premium comparison
- **Google News RSS** — Robinhood Chain headlines

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys below
npx next dev -p 3001         # http://localhost:3001
```

### Environment (`.env.local`)

| Variable | Required | Where to get it (free) |
|---|---|---|
| `LLM_API_KEY` | for AI answers | https://console.groq.com/keys |
| `GEMINI_API_KEY` | optional backup AI | https://aistudio.google.com/apikey |
| `COINGECKO_API_KEY` | optional, faster charts | https://www.coingecko.com/en/api/pricing (Demo plan, $0) |

Without any key Strix still works with live data; the agent answers in rule-based mode.

## CLI

```bash
npm link                       # installs the `strix` command
strix safe PONS
strix whales CASHCAT
strix stocks NVDA
strix wallet 0x…
strix radar
strix smart volume
strix ask "Is CASHCAT safe?"
```

The CLI talks to a running Strix server (`STRIX_URL`, default `http://localhost:3001`).

## MCP (Claude Code)

`.mcp.json` registers the `strix` MCP server (`node bin/strix-mcp.mjs`). Start a Claude Code session in this folder and approve the server; the Strix server must be running.

## Stack

Next.js 16 · React 19 · Tailwind CSS 4 · lightweight-charts · TypeScript
