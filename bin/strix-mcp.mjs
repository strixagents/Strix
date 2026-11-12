#!/usr/bin/env node
// Strix MCP server — exposes the Strix Robinhood Chain tools to any MCP client (Claude Code, etc.) over stdio.
// It forwards each call to a running Strix server (default https://strixagents.com, override with STRIX_URL),
// so it shares the same live data, caches and rate limiting as the web app.
// NOTE: stdout is the MCP channel — never console.log here; use console.error for diagnostics.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.STRIX_URL || "https://strixagents.com").replace(/\/$/, "");

const INTERVALS = ["15m", "1h", "4h", "1d", "1w"];
const SIGNALS = ["momentum", "breakout", "dip_buy", "volume_spike", "buy_pressure", "sell_pressure", "dumping", "new_pool", "deep_liquidity"];
const token = z.string().describe("Token symbol (e.g. NVDA, PONS, CASHCAT, WETH), token contract address, or pool address on Robinhood Chain");

/** Round long decimals so results stay compact for the model. */
const compact = (data) => JSON.stringify(data, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? +v.toPrecision(6) : v));

async function call(name, args) {
  let res;
  try {
    res = await fetch(`${BASE}/api/tool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return { isError: true, content: [{ type: "text", text: `Strix server not reachable at ${BASE}. Start it in the Strix folder with: npx next dev -p 3001` }] };
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) return { isError: true, content: [{ type: "text", text: `Strix error: ${j.error || `HTTP ${res.status}`}` }] };
  return { content: [{ type: "text", text: `${j.summary}\n\n${compact(j.data)}` }] };
}

const server = new McpServer({ name: "strix", version: "1.0.0" });
const ro = { readOnlyHint: true, openWorldHint: true };

server.registerTool(
  "analyze_token",
  {
    title: "Analyze Robinhood Chain token",
    description:
      "Live on-chain stats (price, % change, volume, liquidity, FDV, buys/sells, pool age), risk flags and technical analysis from DEX candles (EMA20/50/200, RSI, MACD, ATR, Bollinger, support/resistance) for a Robinhood Chain (chain 4663) token.",
    inputSchema: { token, interval: z.enum(INTERVALS).optional().describe("Candle timeframe, default 1h") },
    annotations: ro,
  },
  (a) => call("analyze_token", a)
);

server.registerTool(
  "get_token_scorecard",
  {
    title: "Token safety scorecard",
    description:
      "A–F safety grade for a Robinhood Chain token: honeypot check, copycat (same symbol as an older token), liquidity, pool age, holder count, top-10 holder concentration, developer holding %, GeckoTerminal trust score, socials, wash-trading detection.",
    inputSchema: { token },
    annotations: ro,
  },
  (a) => call("get_token_scorecard", a)
);

server.registerTool(
  "get_whale_activity",
  {
    title: "Whale activity",
    description:
      "24h whale flow for a Robinhood Chain token: large DEX buys/sells with wallets, net flow, top accumulating and selling wallets, wash-trading suspicion, and large wallet-to-wallet transfers/mints read from the chain RPC.",
    inputSchema: { token },
    annotations: ro,
  },
  (a) => call("get_whale_activity", a)
);

server.registerTool(
  "get_chain_overview",
  {
    title: "Robinhood Chain overview",
    description: "Robinhood Chain market overview: block height, gas, total DEX volume, top tokens by volume, top gainers and losers, trending pools.",
    inputSchema: {},
    annotations: ro,
  },
  () => call("get_chain_overview", {})
);

server.registerTool(
  "scan_tokens",
  {
    title: "Scan tokens for setups",
    description: "Screen Robinhood Chain tokens for on-chain setups with risk scores. Optionally filter by a signal and a maximum risk level.",
    inputSchema: {
      list: z.enum(["top", "trending", "new"]).optional().describe("Universe: top by volume (default), trending, or newest pools"),
      signal: z.enum(SIGNALS).optional().describe("Only return tokens with this signal"),
      max_risk: z.enum(["Low", "Medium", "High"]).optional().describe("Exclude tokens riskier than this"),
    },
    annotations: ro,
  },
  (a) => call("scan_tokens", a)
);

server.registerTool(
  "get_new_launches",
  {
    title: "New launches",
    description: "Newest pools / token launches on Robinhood Chain with liquidity and risk flags.",
    inputSchema: {},
    annotations: ro,
  },
  () => call("get_new_launches", {})
);

server.registerTool(
  "search_token",
  {
    title: "Search token",
    description: "Find Robinhood Chain tokens/pools by name or symbol. Originals are ranked above copycats with the same symbol.",
    inputSchema: { query: z.string().describe("Name or symbol") },
    annotations: ro,
  },
  (a) => call("search_token", a)
);

server.registerTool(
  "get_stock_premiums",
  {
    title: "Stock token premium",
    description:
      "Official Robinhood stock tokens on Robinhood Chain (NVDA, TSLA, SPY, QQQ, AAPL…) vs the real share price: premium/discount %, US market open/closed, liquidity, lookalike tokens.",
    inputSchema: { ticker: z.string().optional().describe("Optional single ticker, e.g. NVDA") },
    annotations: ro,
  },
  (a) => call("get_stock_premiums", a)
);

server.registerTool(
  "scan_wallet",
  {
    title: "Scan wallet",
    description:
      "Robinhood Chain wallet scan: live holdings with USD value and risk level per token (fake airdrops filtered), bot/relayer detection, and 24h buys/sells (net flow per token).",
    inputSchema: { address: z.string().describe("0x… wallet address") },
    annotations: ro,
  },
  (a) => call("scan_wallet", a)
);

server.registerTool(
  "get_news",
  {
    title: "Robinhood Chain news",
    description: "Latest Robinhood Chain news headlines, optionally about a specific token or topic.",
    inputSchema: { topic: z.string().optional() },
    annotations: ro,
  },
  (a) => call("get_news", a)
);

server.registerTool(
  "scan_contract",
  {
    title: "Contract X-ray",
    description: "Reads a Robinhood Chain token's bytecode on-chain and reports admin powers: mint, blacklist, pause, tax/limit setters, trading switch, upgradeable proxy, and whether ownership is renounced.",
    inputSchema: { token: z.string().describe("Symbol, token address or pool address") },
    annotations: ro,
  },
  (a) => call("scan_contract", a)
);

server.registerTool(
  "compare_tokens",
  {
    title: "Compare tokens",
    description: "Side-by-side comparison of 2–4 Robinhood Chain tokens: price, 24h change, liquidity, volume, FDV, pool age, risk level and flags.",
    inputSchema: { tokens: z.array(z.string()).min(2).max(4).describe("Symbols or addresses") },
    annotations: ro,
  },
  (a) => call("compare_tokens", a)
);

server.registerTool(
  "get_rug_radar",
  {
    title: "Rug Radar",
    description: "Live Robinhood Chain red-flag feed: liquidity pulls, price crashes, sudden supply mints and copycat token launches.",
    inputSchema: { type: z.enum(["liquidity_pull", "crash", "mint", "copycat"]).optional() },
    annotations: ro,
  },
  (a) => call("get_rug_radar", a)
);

server.registerTool(
  "get_smart_money",
  {
    title: "Smart money leaderboard",
    description: "Real wallets ranked by ~24h trading PnL on Robinhood Chain's most liquid tokens, with bots and relayers removed.",
    inputSchema: { sort: z.enum(["pnl", "volume", "trades"]).optional() },
    annotations: ro,
  },
  (a) => call("get_smart_money", a)
);

await server.connect(new StdioServerTransport());
console.error(`[strix-mcp] ready · forwarding to ${BASE}`);
