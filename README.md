# Strix

**The AI trading agent for Robinhood Chain (chain ID 4663).** Live charts, rug-risk checks, whale and wallet tracking, stock-token premiums and an AI analyst — all from real on-chain and market data.

> Research tool only. Nothing here is financial advice.

## Features

| | |
|---|---|
| **Terminal** (`/app`) | Candlestick charts (EMA 20/50/200, auto support/resistance), on-chain stats (liquidity, FDV, buys/sells, pool age), technical bias, ATR stop/target framework, position-size calculator, price alerts |
| **AI agent** | Ask in plain language — it calls live tools and explains the result. Groq primary, Google Gemini backup, rule-based fallback |
| **Analyst panel** | A–F safety scorecard (honeypot, copycat, liquidity, holders, top-10 concentration, dev holding, wash trading), whale flow with bot/relayer detection, holder distribution |
| **Screener** (`/screener`) | Top / trending / new pools with on-chain signals and risk scores |
| **Stocks** (`/stocks`) | Official Robinhood stock tokens vs the real share price — premium/discount, lookalike tokens flagged |
| **Wallet** (`/wallet`) | Any wallet's holdings with risk per token, fake-airdrop filter, 24h buys/sells (smart money), follow list |
| **CLI** | `strix ask`, `analyze`, `safe`, `whales`, `scan`, `new`, `stocks`, `wallet`, `news` |
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
strix ask "Is CASHCAT safe?"
```

The CLI talks to a running Strix server (`STRIX_URL`, default `http://localhost:3001`).

## MCP (Claude Code)

`.mcp.json` registers the `strix` MCP server (`node bin/strix-mcp.mjs`). Start a Claude Code session in this folder and approve the server; the Strix server must be running.

## Stack

Next.js 16 · React 19 · Tailwind CSS 4 · lightweight-charts · TypeScript
