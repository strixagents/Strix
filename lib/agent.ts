import { analyze } from "./indicators";
import { getNews } from "./news";
import { analystReport } from "./analyst";
import { getStockPremiums } from "./stocks";
import { scanWallet } from "./wallet";
import {
  CHAIN, INTERVALS, RISKS, SIGNALS, getCandles, getNetworkStatus, getNewPools, getPool, getTopTokens, getTrending,
  links, resolvePool, risksFor, searchTokens, signalsFor, type Interval, type SignalKey, type Token,
} from "./rhchain";

export type AgentEvent =
  | { t: "step"; id: string; name: string; label: string }
  | { t: "step_done"; id: string; ok: boolean; summary: string }
  | { t: "focus"; pool: string; interval: Interval }
  | { t: "answer"; text: string }
  | { t: "error"; message: string };

type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n)
    ? "n/a"
    : Math.abs(n) >= 1000
      ? n.toLocaleString("en-US", { maximumFractionDigits: d })
      : Math.abs(n) >= 1
        ? +n.toFixed(Math.max(d, 1)) + ""
        : +n.toPrecision(4) + "";
const usd = (n: number | null | undefined) =>
  n == null ? "n/a" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;

/** Compact token view for the LLM. */
function brief(t: Token) {
  const r = risksFor(t);
  return {
    symbol: t.symbol, name: t.name, pool: t.pool, quote: t.quote, dex: t.dex, priceUsd: t.price,
    changePct: t.change, volumeUsd: t.volume, liquidityUsd: Math.round(t.liquidity), fdvUsd: t.fdv && Math.round(t.fdv),
    txns24h: t.txns.h24, poolAgeHours: t.ageHours && +t.ageHours.toFixed(1), tokenAddress: t.address,
    ...(t.copycatOf ? { copycatOf: t.copycatOf } : {}),
    signals: signalsFor(t).map((s) => SIGNALS[s].label), risk: { level: r.level, score: r.score, flags: r.flags.map((f) => RISKS[f].label) },
  };
}

/* ───────────── tools ───────────── */

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "analyze_token",
      description:
        "Full analysis of one Robinhood Chain token: live on-chain stats (price, % change, volume, liquidity, FDV, buys/sells, pool age), risk flags, and technical indicators from DEX candles (EMA20/50/200, RSI, MACD, ATR, Bollinger, swing support/resistance, ATR risk plan). Accepts a symbol (NVDA, CASHCAT, PONS, WETH), a token address or a pool address.",
      parameters: {
        type: "object",
        properties: {
          token: { type: "string", description: "Symbol, token address or pool address on Robinhood Chain" },
          interval: { type: "string", enum: INTERVALS, description: "Candle timeframe. Default 1h. Use 15m for scalps, 4h/1d for swings." },
        },
        required: ["token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_chain_overview",
      description: "Robinhood Chain market overview: network status (block, gas), total DEX volume/liquidity, top tokens by volume, top gainers and losers, trending pools.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_tokens",
      description: "Screen Robinhood Chain tokens for on-chain setups (momentum, breakouts, dips, volume spikes, buy/sell pressure, new pools) with risk scores. Use for 'what's pumping', 'token apa yang lagi naik', 'find dip buys'.",
      parameters: {
        type: "object",
        properties: {
          list: { type: "string", enum: ["top", "trending", "new"], description: "Universe: top by volume (default), trending pools, or newest pools" },
          signal: { type: "string", enum: Object.keys(SIGNALS), description: "Optional: only return tokens with this signal" },
          max_risk: { type: "string", enum: ["Low", "Medium", "High"], description: "Optional: exclude tokens riskier than this" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_new_launches",
      description: "Newest pools/token launches on Robinhood Chain with liquidity and risk flags. Use for 'token baru', 'new launches', 'fresh pairs'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_token",
      description: "Find Robinhood Chain tokens/pools by name or symbol when unsure which one the user means.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_scorecard",
      description:
        "Safety scorecard for a Robinhood Chain token (A–F grade): honeypot check, copycat check, liquidity, pool age, holder count, top-10 holder concentration, developer holding %, GeckoTerminal trust score, socials, wash-trading detection. Use for 'aman ga', 'is this a rug', 'should I trust this token', 'cek holder'.",
      parameters: { type: "object", properties: { token: { type: "string", description: "Symbol, token address or pool address" } }, required: ["token"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_whale_activity",
      description:
        "Whale activity for a Robinhood Chain token over 24h: large DEX buys/sells (with wallets), net whale flow, top accumulating and selling wallets, wash-trading suspicion, plus large wallet-to-wallet transfers/mints from the chain RPC. Use for 'whale', 'ada yang borong', 'smart money', 'who is buying'.",
      parameters: { type: "object", properties: { token: { type: "string", description: "Symbol, token address or pool address" } }, required: ["token"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_premiums",
      description:
        "Official Robinhood stock tokens on Robinhood Chain (NVDA, TSLA, SPY, QQQ, AAPL…) vs the real share price on its exchange: premium/discount %, whether the US market is open, liquidity, and lookalike tokens. Use for 'stock token premium', 'is NVDA token cheaper than the stock', 'arbitrage', 'after-hours sentiment'.",
      parameters: { type: "object", properties: { ticker: { type: "string", description: "Optional: only this ticker" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_wallet",
      description:
        "Scan a Robinhood Chain wallet address: live holdings with USD value and a risk level per token (fake airdrops filtered), whether the address is a bot/relayer, and what it bought/sold in the last 24h (net flow per token). Use for 'check my wallet', 'what is this whale buying', 'smart money', 'portfolio risk'.",
      parameters: { type: "object", properties: { address: { type: "string", description: "0x… wallet address" } }, required: ["address"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_news",
      description: "Latest Robinhood Chain news headlines, optionally about a specific token or topic.",
      parameters: { type: "object", properties: { topic: { type: "string" } } },
    },
  },
] as const;

type ToolResult = { data: unknown; summary: string; focus?: { pool: string; interval: Interval } };

export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  switch (name) {
    case "analyze_token": {
      const interval = (INTERVALS.includes(args.interval as Interval) ? args.interval : "1h") as Interval;
      const pool = await resolvePool(String(args.token));
      const [t, candles] = await Promise.all([getPool(pool), getCandles(pool, interval).catch(() => null)]);
      const ta = candles && candles.length >= 30 ? analyze(candles) : null;
      return {
        data: {
          chain: CHAIN.name, ...brief(t), links: links(t), interval,
          technical: ta
            ? { bias: ta.bias, score: ta.score, reasons: ta.reasons, price: ta.price, ema20: ta.ema20, ema50: ta.ema50, ema200: ta.ema200, rsi: ta.rsi, macdHist: ta.macd.hist, atr: ta.atr, atrPct: ta.atrPct, bollinger: ta.bollinger, support: ta.support.map((s) => s.price), resistance: ta.resistance.map((s) => s.price), riskPlan: ta.riskPlan }
            : "Not enough candle history yet (new pool) or candle feed busy — rely on on-chain stats.",
        },
        summary: `${t.symbol} $${fmt(t.price)} · 24h ${fmt(t.change.h24)}% · liq ${usd(t.liquidity)}${ta ? ` · RSI ${fmt(ta.rsi, 1)} · ${ta.bias}` : ""}`,
        focus: { pool, interval },
      };
    }
    case "get_chain_overview": {
      const [top, trending, net] = await Promise.all([getTopTokens(), getTrending().catch(() => []), getNetworkStatus().catch(() => null)]);
      const liquid = top.filter((t) => t.liquidity > 100_000);
      const byChg = [...liquid].sort((a, b) => b.change.h24 - a.change.h24);
      const line = (t: Token) => ({ symbol: t.symbol, priceUsd: t.price, change24h: t.change.h24, volume24h: Math.round(t.volume.h24), liquidity: Math.round(t.liquidity) });
      return {
        data: {
          network: net, totalVolume24h: Math.round(top.reduce((s, t) => s + t.volume.h24, 0)),
          topByVolume: top.slice(0, 10).map(line), gainers: byChg.slice(0, 5).map(line), losers: byChg.slice(-5).reverse().map(line),
          trending: trending.slice(0, 8).map(line),
        },
        summary: `${top.length} tokens · vol ${usd(top.reduce((s, t) => s + t.volume.h24, 0))}${net ? ` · block ${net.block.toLocaleString()}` : ""}`,
      };
    }
    case "scan_tokens": {
      const list = String(args.list || "top");
      const tokens = list === "new" ? await getNewPools() : list === "trending" ? await getTrending() : await getTopTokens();
      const sig = args.signal as SignalKey | undefined;
      const order = { Low: 0, Medium: 1, High: 2 } as const;
      const maxR = args.max_risk as keyof typeof order | undefined;
      const hits = tokens
        .filter((t) => (sig ? signalsFor(t).includes(sig) : signalsFor(t).length > 0))
        .filter((t) => !maxR || order[risksFor(t).level] <= order[maxR])
        .slice(0, 15)
        .map(brief);
      return { data: { list, scanned: tokens.length, matches: hits }, summary: `${hits.length}/${tokens.length} tokens matched` };
    }
    case "get_new_launches": {
      const n = await getNewPools();
      return { data: n.slice(0, 15).map(brief), summary: `${n.length} new pools` };
    }
    case "search_token": {
      const r = await searchTokens(String(args.query));
      return { data: r.slice(0, 8), summary: r.slice(0, 3).map((x) => x.symbol).join(", ") || "no match" };
    }
    case "get_token_scorecard": {
      const pool = await resolvePool(String(args.token));
      const r = await analystReport(pool);
      return {
        data: {
          symbol: r.token.symbol, tokenAddress: r.token.address, pool: r.token.pool,
          scorecard: r.scorecard,
          holders: r.info?.holders ?? null, developerHoldingPct: r.info?.developerHoldingPct ?? null, honeypot: r.info?.honeypot ?? "unknown",
          socials: r.info ? { websites: r.info.websites, twitter: r.info.twitter, telegram: r.info.telegram } : null,
        },
        summary: `${r.token.symbol}: ${r.scorecard.grade} (${r.scorecard.score}/100) · ${r.scorecard.verdict}`,
        focus: { pool, interval: "1h" },
      };
    }
    case "get_whale_activity": {
      const pool = await resolvePool(String(args.token));
      const r = await analystReport(pool);
      const w = r.whales;
      return {
        data: {
          symbol: r.token.symbol, pool: r.token.pool, liquidityUsd: Math.round(r.token.liquidity),
          whales: w && {
            thresholdUsd: w.minUsd, pressure: w.pressure, buysUsd: Math.round(w.buysUsd), sellsUsd: Math.round(w.sellsUsd), buys: w.buys, sells: w.sells,
            uniqueWallets: w.wallets, washSuspect: w.washSuspect, topWalletSharePct: Math.round(w.topWalletShare * 100),
            topAccumulators: w.topAccumulators.map((x) => ({ wallet: x.wallet, netUsd: Math.round(x.netUsd), trades: x.trades })),
            topSellers: w.topSellers.map((x) => ({ wallet: x.wallet, netUsd: Math.round(x.netUsd), trades: x.trades })),
            latest: w.trades.slice(0, 10).map((t) => ({ kind: t.kind, usd: Math.round(t.usd), wallet: t.wallet, time: t.time })),
          },
          largeTransfers: r.transfers.slice(0, 8).map((t) => ({ kind: t.kind, usd: Math.round(t.usd), from: t.from, to: t.to })),
        },
        summary: w ? `${r.token.symbol}: ${w.pressure} · +$${Math.round(w.buysUsd).toLocaleString("en-US")} / −$${Math.round(w.sellsUsd).toLocaleString("en-US")}${w.washSuspect ? " · wash suspect" : ""}` : "no whale data",
        focus: { pool, interval: "1h" },
      };
    }
    case "get_stock_premiums": {
      const { rows, marketOpen } = await getStockPremiums();
      const want = args.ticker ? String(args.ticker).toUpperCase().replace(/^\$/, "") : null;
      const list = rows.filter((r) => !want || r.ticker === want).filter((r) => r.liquidity >= 50_000 || want);
      return {
        data: {
          usMarketOpen: marketOpen,
          note: marketOpen ? "Live comparison during the regular session." : "US market closed — stock price is the last close; the token keeps trading 24/7.",
          stocks: list.map((r) => ({
            ticker: r.ticker, name: r.name, tokenPriceUsd: r.tokenPrice, stockPriceUsd: r.stockPrice, premiumPct: r.premiumPct,
            tokenChange24hPct: r.tokenChange24h, stockDayChangePct: r.stockChangePct, liquidityUsd: Math.round(r.liquidity), volume24hUsd: Math.round(r.volume24h),
            lookalikeTokens: r.lookalikes, pool: r.pool,
          })),
        },
        summary: want
          ? `${want}: ${list[0]?.premiumPct != null ? `${list[0].premiumPct >= 0 ? "+" : ""}${list[0].premiumPct.toFixed(2)}% vs stock` : "no comparison"}`
          : `${list.length} stock tokens · market ${marketOpen ? "open" : "closed"}`,
        ...(want && list[0] ? { focus: { pool: list[0].pool, interval: "1h" as Interval } } : {}),
      };
    }
    case "scan_wallet": {
      const s = await scanWallet(String(args.address), 24);
      return {
        data: {
          address: s.address, transactionsSent: s.txCount, looksLikeBot: s.isBot, portfolioUsd: Math.round(s.totalValue),
          highRiskUsd: Math.round(s.highRiskValue), spamTokensHidden: s.spamCount,
          holdings: s.holdings.filter((h) => !h.spam).slice(0, 15).map((h) => ({ symbol: h.symbol, balance: h.balance, valueUsd: h.value && Math.round(h.value), risk: h.risk?.level ?? null, flags: h.risk?.flags ?? [] })),
          last24h: { swaps: s.activity.swaps, netFlowsUsd: s.activity.netFlows.slice(0, 10).map((f) => ({ symbol: f.symbol, netUsd: Math.round(f.netUsd), boughtUsd: Math.round(f.inUsd), soldUsd: Math.round(f.outUsd) })) },
        },
        summary: `${s.address.slice(0, 8)}…: ${usd(s.totalValue)} · ${s.holdings.filter((h) => !h.spam).length} tokens · ${s.activity.swaps} trades 24h${s.isBot ? " · BOT" : ""}`,
      };
    }
    case "get_news": {
      const n = await getNews(args.topic ? String(args.topic) : undefined, 8);
      return { data: n.map(({ title, date, source }) => ({ title, date, source })), summary: `${n.length} headlines` };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

const LABELS: Record<string, (a: Record<string, unknown>) => string> = {
  analyze_token: (a) => `Reading ${a.token} on-chain stats & ${a.interval ?? "1h"} candles`,
  get_chain_overview: () => "Pulling Robinhood Chain market overview",
  scan_tokens: (a) => `Scanning ${a.list ?? "top"} tokens${a.signal ? ` for ${a.signal}` : ""}`,
  get_new_launches: () => "Checking newest pools on Robinhood Chain",
  search_token: (a) => `Searching for “${a.query}”`,
  get_news: (a) => `Reading Robinhood Chain news${a.topic ? ` about ${a.topic}` : ""}`,
  get_token_scorecard: (a) => `Running safety scorecard on ${a.token} (holders, honeypot, dev wallet…)`,
  get_whale_activity: (a) => `Tracking whale wallets & large trades on ${a.token}`,
  get_stock_premiums: (a) => `Comparing ${a.ticker ?? "stock"} tokens with the real share price`,
  scan_wallet: (a) => `Scanning wallet ${String(a.address).slice(0, 8)}… holdings & 24h trades`,
};

/* ───────────── LLM loop ───────────── */

const SYSTEM = `You are Strix, an honest AI trading research agent specialised in Robinhood Chain (Arbitrum Orbit L2, chain ID ${CHAIN.id}, gas in ETH).
Tokens there include memecoins, launchpad tokens, and tokenized stocks (e.g. NVDA, TSLA) quoted in WETH or USDG.
Today is ${new Date().toISOString().slice(0, 10)}.
Rules:
- ALWAYS call tools before giving any number. Never invent prices, levels, liquidity or addresses.
- Token question → analyze_token (1h by default; add 4h/1d for swing context). Market question → get_chain_overview. Discovery → scan_tokens / get_new_launches.
- Never tell the user what to buy or sell and never label a scenario as "recommended" / "rekomendasi". Present bullish and bearish scenarios neutrally with their triggers; the user decides.
- Safety questions ("aman ga?", rug, holder, trust) → get_token_scorecard. Whale / smart-money questions → get_whale_activity. For a full token review, call analyze_token AND get_token_scorecard.
- Stock tokens vs real shares → get_stock_premiums. A wallet address (0x + 40 hex) → scan_wallet. If a wallet looksLikeBot, say it is a bot/relayer and should not be copied.
- If whales.washSuspect is true, say clearly that the volume is likely fake (one wallet trading with itself).
- If a token has the "Possible copycat" flag, say so loudly: another older token uses the same symbol; tell the user to verify the contract address (copycatOf is the original).
- On-chain risk matters as much as the chart: always mention liquidity, FDV vs liquidity, pool age, buy/sell balance and the risk level. Warn clearly on High risk (possible rug, thin liquidity, heavy slippage).
- ALWAYS reply in English, even if the user writes in another language.
- Markdown, concise: **Summary**, **On-chain** (liq, FDV, volume, buys/sells, age), **Technicals** (if candles available), **Levels & scenarios** (bull/bear with entry, stop, targets from the ATR risk plan), **Risks**.
- Use tables when comparing tokens.
- End with a short reminder: not financial advice; size small on new/low-liquidity tokens.`;

type LLM = { name: string; key: string; base: string; model: string };

/** Primary (Groq) + optional backup (Google Gemini, free) — both speak the OpenAI chat format. */
function llmProviders(): LLM[] {
  const list: LLM[] = [];
  if (process.env.LLM_API_KEY)
    list.push({
      name: "Groq",
      key: process.env.LLM_API_KEY,
      base: (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
      model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
    });
  if (process.env.GEMINI_API_KEY) {
    // comma-separated chain: if one Gemini model is overloaded (503) or retired (404), the next is tried
    const models = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
    for (const model of models)
      list.push({ name: `Gemini (${model})`, key: process.env.GEMINI_API_KEY, base: "https://generativelanguage.googleapis.com/v1beta/openai", model });
  }
  return list;
}
const llmConfig = () => llmProviders()[0] ?? null;
export const llmEnabled = () => llmConfig() != null;

/** Free LLM tiers limit tokens per minute: send tool data compactly (5 significant digits, no long lists). */
const compact = (data: unknown) =>
  JSON.stringify(data, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? +v.toPrecision(5) : v));

/**
 * Try each provider in order. A rate-limited primary hands over to the backup immediately
 * (no waiting); only the last provider waits out a short 429 before giving up.
 */
async function chatAny(providers: LLM[], messages: Msg[], onWait: (s: number) => void, onSwitch: (to: string) => void) {
  let lastErr: Error | null = null;
  for (let i = 0; i < providers.length; i++) {
    const isLast = i === providers.length - 1;
    try {
      return await chat(providers[i], messages, isLast ? onWait : null);
    } catch (e) {
      lastErr = e as Error;
      if (!isLast) onSwitch(providers[i + 1].name);
    }
  }
  throw lastErr ?? new Error("No AI provider configured");
}

async function chat(cfg: LLM, messages: Msg[], onWait: ((s: number) => void) | null) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.3 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 && attempt === 0) {
      // free tier per-minute token limit: wait as told (max 25s) and retry once
      const body = await res.text();
      const secs = Math.ceil(+(body.match(/try again in ([\d.]+)s/)?.[1] ?? res.headers.get("retry-after") ?? 10));
      if (onWait && secs <= 25) {
        onWait(secs);
        await new Promise((r) => setTimeout(r, secs * 1000 + 300));
        continue;
      }
      throw new Error(`LLM 429: ${body.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const d = await res.json();
    return d.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
  }
}

export async function runAgent(history: { role: "user" | "assistant"; content: string }[], emit: (e: AgentEvent) => void) {
  let providers = llmProviders();
  if (!providers.length) return runFallback(history.at(-1)?.content ?? "", emit, "nokey");

  // keep earlier answers short in the context so we stay within the free token budget
  const trimmed = history.slice(-8).map((m, i, arr) => (m.role === "assistant" && i < arr.length - 1 ? { ...m, content: m.content.slice(0, 1200) } : m));
  const messages: Msg[] = [{ role: "system", content: SYSTEM }, ...trimmed];
  let stepN = 0;
  let waitN = 0;
  for (let iter = 0; iter < 6; iter++) {
    let msg;
    try {
      msg = await chatAny(
        providers,
        messages,
        (s) => {
          const id = `w${waitN++}`;
          emit({ t: "step", id, name: "wait", label: `AI is busy (free tier limit) — continuing in ${s}s` });
          setTimeout(() => emit({ t: "step_done", id, ok: true, summary: "resumed" }), s * 1000);
        },
        (to) => {
          const id = `w${waitN++}`;
          emit({ t: "step", id, name: "switch", label: `Primary AI is busy — switching to ${to}` });
          emit({ t: "step_done", id, ok: true, summary: `using ${to}` });
          // keep using the backup for the rest of this answer
          providers = providers.slice(Math.max(0, providers.findIndex((p) => p.name === to)));
        }
      );
    } catch (e) {
      emit({ t: "error", message: (e as Error).message });
      return runFallback(history.at(-1)?.content ?? "", emit, "busy");
    }
    if (!msg.tool_calls?.length) {
      emit({ t: "answer", text: msg.content || "…" });
      return;
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    // sequential: data provider is rate-limited
    for (const tc of msg.tool_calls) {
      const id = `s${stepN++}`;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      emit({ t: "step", id, name: tc.function.name, label: (LABELS[tc.function.name] ?? (() => tc.function.name))(args) });
      let content: string;
      try {
        const r = await runTool(tc.function.name, args);
        if (r.focus) emit({ t: "focus", ...r.focus });
        emit({ t: "step_done", id, ok: true, summary: r.summary });
        content = compact(r.data);
      } catch (e) {
        emit({ t: "step_done", id, ok: false, summary: (e as Error).message });
        content = JSON.stringify({ error: (e as Error).message });
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content });
    }
  }
  emit({ t: "answer", text: "I hit my step limit — try a more specific question." });
}

/* ───────────── no-LLM fallback: rule-based reports from real data ───────────── */

async function step(id: string, name: string, args: Record<string, unknown>, emit: (e: AgentEvent) => void) {
  emit({ t: "step", id, name, label: LABELS[name](args) });
  try {
    const r = await runTool(name, args);
    if (r.focus) emit({ t: "focus", ...r.focus });
    emit({ t: "step_done", id, ok: true, summary: r.summary });
    return r;
  } catch (e) {
    emit({ t: "step_done", id, ok: false, summary: (e as Error).message });
    return null;
  }
}

let NOTE = "";
const NOTES = {
  nokey: "> ⚙️ *Rule-based mode — set `LLM_API_KEY` for full AI reasoning.*",
  busy: "> ⏳ *The free AI tier is busy right now — here is the rule-based report from the same live data. Ask again in a minute for the full AI answer.*",
};
const END = "*Not financial advice. Size small on new or thin-liquidity tokens.*";
type Brief = ReturnType<typeof brief>;
const row = (b: Brief) =>
  `| **${b.symbol}** | $${fmt(b.priceUsd)} | ${fmt(b.changePct.h1)}% | ${fmt(b.changePct.h24)}% | ${usd(b.volumeUsd.h24)} | ${usd(b.liquidityUsd)} | ${b.risk.level} | ${b.signals.join(", ") || "–"} |`;
const HEAD = "| Token | Price | 1h | 24h | Vol 24h | Liquidity | Risk | Signals |\n|---|---|---|---|---|---|---|---|";

const SIGNAL_WORDS: [RegExp, SignalKey][] = [
  [/momentum|naik terus|uptrend/i, "momentum"],
  [/breakout|pump|terbang|naik/i, "breakout"],
  [/dip|diskon|koreksi|pullback/i, "dip_buy"],
  [/volume/i, "volume_spike"],
  [/buy pressure|banyak beli|akumulasi/i, "buy_pressure"],
  [/dump|turun|anjlok|crash/i, "dumping"],
];

async function runFallback(text: string, emit: (e: AgentEvent) => void, reason: keyof typeof NOTES = "nokey") {
  NOTE = NOTES[reason];

  const symGuess = text.match(/\$([A-Za-z0-9]{2,15})/)?.[1] ?? text.match(/0x[0-9a-fA-F]{40,64}/)?.[0] ?? text.match(/\b[A-Z][A-Z0-9]{1,11}\b/)?.[0];
  if (symGuess && /whale|borong|smart money|aman|rug|holder|scam|safe|honeypot|trust|percaya/i.test(text)) {
    emit({ t: "step", id: "a0", name: "get_token_scorecard", label: LABELS.get_token_scorecard({ token: symGuess }) });
    try {
      const pool = await resolvePool(symGuess);
      const r = await analystReport(pool);
      emit({ t: "focus", pool, interval: "1h" });
      emit({ t: "step_done", id: "a0", ok: true, summary: `${r.token.symbol}: ${r.scorecard.grade} (${r.scorecard.score}/100)` });
      const w = r.whales;
      const mark = { pass: "✅", warn: "⚠️", fail: "❌", info: "ℹ️" } as const;
      return emit({
        t: "answer",
        text: `### ${r.token.symbol} — safety grade **${r.scorecard.grade}** (${r.scorecard.score}/100)
${NOTE}

**${r.scorecard.verdict}**

${r.scorecard.checks.map((c) => `- ${mark[c.status]} **${c.label}** — ${c.detail}`).join("\n")}

${w ? `**🐋 Whales (24h, trades ≥ ${usd(w.minUsd)})** — ${w.pressure}: ${usd(w.buysUsd)} bought (${w.buys}) vs ${usd(w.sellsUsd)} sold (${w.sells}) by ${w.wallets} wallets.${w.washSuspect ? `\n\n⚠️ **${Math.round(w.topWalletShare * 100)}% of the large trades come from one wallet buying and selling — the volume is likely fake.**` : ""}
${w.topAccumulators.length ? `\nTop accumulators: ${w.topAccumulators.slice(0, 3).map((x) => `\`${x.wallet.slice(0, 6)}…${x.wallet.slice(-4)}\` +${usd(x.netUsd)}`).join(", ")}` : ""}` : ""}

${END}`,
      });
    } catch (e) {
      emit({ t: "step_done", id: "a0", ok: false, summary: (e as Error).message });
    }
  }
  const t = text.toLowerCase();

  if (/\bnew\b|baru|launch|fresh|listing/.test(t)) {
    const r = await step("f0", "get_new_launches", {}, emit);
    const d = (r?.data as Brief[] | undefined) ?? [];
    return emit({ t: "answer", text: `### Newest pools on Robinhood Chain\n${NOTE}\n\n${HEAD}\n${d.slice(0, 12).map(row).join("\n")}\n\nNew pools are the riskiest corner of any chain — check liquidity and holders before buying.\n\n${END}` });
  }

  const sig = SIGNAL_WORDS.find(([re]) => re.test(text))?.[1];
  if (sig || /scan|screen|apa (aja )?yang|which tokens|token apa|koin apa|gainer|loser/.test(t)) {
    const r = await step("f0", "scan_tokens", { list: /trending/.test(t) ? "trending" : "top", signal: sig }, emit);
    const d = r?.data as { scanned: number; matches: Brief[] } | undefined;
    if (!d?.matches.length) return emit({ t: "answer", text: `No tokens match${sig ? ` **${SIGNALS[sig].label}**` : ""} right now.\n\n${END}` });
    return emit({ t: "answer", text: `### Robinhood Chain scan${sig ? ` — ${SIGNALS[sig].label}` : ""}\n${NOTE}\n\n${HEAD}\n${d.matches.map(row).join("\n")}\n\nScanned ${d.scanned} tokens.\n\n${END}` });
  }

  const sym = text.match(/\$([A-Za-z0-9]{2,15})/)?.[1] ?? text.match(/0x[0-9a-fA-F]{40,64}/)?.[0] ?? text.match(/\b[A-Z][A-Z0-9]{1,11}\b/)?.[0];
  if (!sym || /overview|market|pasar|hari ini|today|chain/.test(t) && !text.match(/\$|\b[A-Z]{2,}\b/)) {
    const r = await step("f0", "get_chain_overview", {}, emit);
    type Line = { symbol: string; priceUsd: number; change24h: number; volume24h: number; liquidity: number };
    const d = r?.data as { network: { block: number; gasGwei: number } | null; totalVolume24h: number; topByVolume: Line[]; gainers: Line[]; losers: Line[] } | undefined;
    if (!d) return emit({ t: "answer", text: "Couldn't load Robinhood Chain data right now — try again in a minute." });
    const l = (x: Line) => `| **${x.symbol}** | $${fmt(x.priceUsd)} | ${fmt(x.change24h)}% | ${usd(x.volume24h)} | ${usd(x.liquidity)} |`;
    const H = "| Token | Price | 24h | Volume | Liquidity |\n|---|---|---|---|---|";
    return emit({
      t: "answer",
      text: `### Robinhood Chain today\n${NOTE}\n\n${d.network ? `Block **${d.network.block.toLocaleString()}** · gas **${fmt(d.network.gasGwei, 4)} gwei** · ` : ""}DEX volume 24h **${usd(d.totalVolume24h)}**\n\n**Top by volume**\n\n${H}\n${d.topByVolume.slice(0, 8).map(l).join("\n")}\n\n**Top gainers**\n\n${H}\n${d.gainers.map(l).join("\n")}\n\n**Top losers**\n\n${H}\n${d.losers.map(l).join("\n")}\n\n${END}`,
    });
  }

  const r = await step("f0", "analyze_token", { token: sym, interval: "1h" }, emit);
  const d = r?.data as (Brief & { technical: ReturnType<typeof analyze> | string; links: ReturnType<typeof links> }) | undefined;
  if (!d) return emit({ t: "answer", text: `Couldn't find **${sym}** on Robinhood Chain. Try the exact symbol or paste the token/pool address.` });
  const ta = typeof d.technical === "string" ? null : d.technical;
  const lv = (arr: { price: number }[]) => arr.map((x) => fmt(x.price)).join(" · ") || "n/a";
  emit({
    t: "answer",
    text: `### ${d.symbol} (${d.name}) — ${ta ? ta.bias : "on-chain view"} · risk **${d.risk.level}**
${NOTE}

| On-chain | |
|---|---|
| Price | $${fmt(d.priceUsd)} |
| Change 1h / 6h / 24h | ${fmt(d.changePct.h1)}% / ${fmt(d.changePct.h6)}% / ${fmt(d.changePct.h24)}% |
| Volume 24h | ${usd(d.volumeUsd.h24)} |
| Liquidity | ${usd(d.liquidityUsd)} |
| FDV | ${usd(d.fdvUsd)} |
| Buys / sells 24h | ${d.txns24h.buys} / ${d.txns24h.sells} |
| Pool age | ${d.poolAgeHours != null ? `${fmt(d.poolAgeHours / 24, 1)} days` : "n/a"} · ${d.dex} |

**Risk flags:** ${d.risk.flags.join(", ") || "none detected"}
**Signals:** ${d.signals.join(", ") || "none"}

${ta ? `**Technical (1h):** RSI ${fmt(ta.rsi, 1)} · MACD hist ${fmt(ta.macd.hist, 4)} · EMA20/50/200 ${fmt(ta.ema20)} / ${fmt(ta.ema50)} / ${fmt(ta.ema200)}
**Why:** ${ta.reasons.join("; ")}.

**Support:** ${lv(ta.support)}
**Resistance:** ${lv(ta.resistance)}

**ATR plan** — long: stop ${fmt(ta.riskPlan?.long.stop)}, TP1 ${fmt(ta.riskPlan?.long.tp1)}, TP2 ${fmt(ta.riskPlan?.long.tp2)} · short: stop ${fmt(ta.riskPlan?.short.stop)}, TP1 ${fmt(ta.riskPlan?.short.tp1)}` : "_Not enough candle history for technicals yet._"}

[Explorer](${d.links.explorer}) · [GeckoTerminal](${d.links.geckoterminal}) · [DexScreener](${d.links.dexscreener})

${END}`,
  });
}
