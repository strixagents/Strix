# Contributing to Strix

Thanks for helping make Strix better. A few ground rules keep the project useful and honest.

## Principles

- **Real data only.** Every number shown on the site or returned by a tool must come from a live source (Robinhood Chain RPC, GeckoTerminal, DexScreener, Yahoo Finance, Google News). No sample, mock or hardcoded figures.
- **Free APIs.** New data sources must have a free tier that covers normal use.
- **Research, not advice.** Strix explains data and risk. It never gives buy/sell calls, entries, stops or targets.
- **English UI.** All user-facing text and agent replies are in English.

## Getting started

```bash
git clone https://github.com/strixagents/Strix
cd Strix
npm install
cp .env.example .env.local    # add a free Groq key (optional: Gemini, CoinGecko Demo)
npm run dev -- -p 3001
```

Before opening a pull request:

```bash
npx tsc --noEmit              # typecheck
npm run build                 # production build
```

## Adding an agent tool

1. Add the tool definition to `TOOLS` and a case to `runTool` in `lib/agent.ts`.
2. Return a compact `data` object for the model, a one-line `summary`, and optionally a `card` for the chat.
3. If it should be available outside the browser, register it in `bin/strix-mcp.mjs` and add a CLI command in `bin/strix.mjs`.
4. The docs page (`/docs`) lists tools from `TOOLS` automatically.

## Pull requests

- Keep changes focused and describe what you tested against live data.
- Do not commit `.env.local` or any API key.
