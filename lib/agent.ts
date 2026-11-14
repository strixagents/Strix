import { analyze } from "./indicators";
import { getNews } from "./news";
import { analystReport } from "./analyst";
import { getStockPremiums } from "./stocks";
import { scanWallet } from "./wallet";
import { getRadar } from "./radar";
import { getSmartMoney } from "./smartmoney";
import { isAddress } from "./evm";
import { scanContract } from "./contract";
import { readImage, visionSummary } from "./vision";
import { getLaunches } from "./launches";
import { shareSlug } from "./report";
import {
  CHAIN, INTERVALS, RISKS, SIGNALS, getCandles, getNetworkStatus, getNewPools, getPool, getTopTokens, getTrending,
  getPrices, links, resolvePool, risksFor, searchTokens, signalsFor, trusted, type Interval, type SignalKey, type Token,
} from "./rhchain";

export type AgentEvent =
  | { t: "step"; id: string; name: string; label: string }
  | { t: "step_done"; id: string; ok: boolean; summary: string }
  | { t: "focus"; pool: string; interval: Interval }
  | { t: "answer"; text: string }
  | { t: "delta"; text: string }
  | { t: "reset" }
  | { t: "card"; card: Card }
  | { t: "followups"; items: string[] }
  | { t: "meta"; model: string; ms: number; tools: number }
  | { t: "action"; action: AgentAction }
  | { t: "error"; message: string };

/** Things the agent does for the user; applied in the browser (alerts, watchlist, followed wallets live there). */
export type AgentAction =
  | { kind: "alert"; pool: string; symbol: string; price: number; dir: "above" | "below" }
  | { kind: "watch"; op: "add" | "remove"; pool: string; symbol: string }
  | { kind: "follow"; op: "add" | "remove"; address: string; label: string };

/** What the browser tells the agent about the user (no accounts — it all lives in their browser). */
export type AgentCtx = {
  viewing?: string;
  web?: boolean;
  /** data:image/… URL of a screenshot attached to the latest question */
  image?: string;
  watchlist?: { pool: string; symbol: string }[];
  wallets?: { address: string; label: string }[];
  alerts?: { pool: string; symbol: string; price: number; dir: "above" | "below" }[];
};

/** Structured live-data cards shown inside the chat next to the AI's text. */
export type Card =
  | { kind: "token"; symbol: string; name: string; image: string | null; pool: string; price: number; h1: number; h24: number; liquidity: number; volume24h: number; fdv: number | null; risk: string; flags: string[]; bias: string | null; rsi: number | null; interval: string; spark: number[] }
  | { kind: "score"; symbol: string; pool: string; grade: string; score: number; verdict: string; checks: { label: string; status: string }[]; honeypot: string; holders: number | null }
  | { kind: "whales"; symbol: string; pool: string; pressure: string; buysUsd: number; sellsUsd: number; wallets: number; wash: boolean; topWallet: string | null }
  | { kind: "wallet"; address: string; valueUsd: number; tokens: number; trades: number; bot: boolean; top: { symbol: string; valueUsd: number }[] }
  | { kind: "radar"; watching: number; events: { symbol: string; title: string; severity: string; pool: string }[] }
  | { kind: "traders"; windowHours: number; top: { wallet: string; pnlUsd: number; volumeUsd: number; automated: boolean }[] }
  | { kind: "action"; icon: string; text: string; href?: string }
  | { kind: "contract"; symbol: string; address: string; verdict: string; sizeBytes: number; owner: string; proxy: string | null; findings: { label: string; severity: string; detail: string }[]; note: string }
  | { kind: "watchlist"; items: { symbol: string; pool: string; price: number; h24: number; liquidity: number; risk: string }[]; alerts: { symbol: string; price: number; dir: string; distancePct: number | null }[]; wallets: number }
  | { kind: "compare"; rows: { symbol: string; pool: string; price: number; h24: number; liquidity: number; volume24h: number; fdv: number | null; ageDays: number | null; risk: string; flags: string[] }[] };

type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string }; extra_content?: unknown };

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
        "Full analysis of one Robinhood Chain token: live on-chain stats (price, % change, volume, liquidity, FDV, buys/sells, pool age), risk flags, and technical indicators from DEX candles (EMA20/50/200, RSI, MACD, ATR, Bollinger, swing support/resistance). Accepts a symbol (NVDA, CASHCAT, PONS, WETH), a token address or a pool address.",
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
      description:
        "Launch Scanner: every token launched on Robinhood Chain in the last 24h with an early A–F launch grade and its reasons — admin powers in the contract, bundled launches / first-minute snipers (wallets and % of supply), copycats, fake or empty liquidity, spoofed volume. Use for 'token baru', 'new launches', 'any safe new tokens?', 'which launches are bundled?'.",
      parameters: { type: "object", properties: { only: { type: "string", enum: ["all", "safe", "risky"], description: "safe = grades A–B and not a copycat (fewest red flags), risky = D–F or copycats" } } },
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
  {
    type: "function",
    function: {
      name: "get_rug_radar",
      description: "Live Rug Radar for Robinhood Chain: recent liquidity pulls, price crashes, sudden supply mints and copycat launches detected by Strix's background watcher. Use for 'any rugs?', 'what's dumping?', 'is anything sketchy right now?'.",
      parameters: { type: "object", properties: { type: { type: "string", enum: ["liquidity_pull", "crash", "mint", "copycat"] } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_smart_money",
      description: "Smart-money leaderboard: real wallets ranked by trading PnL on Robinhood Chain's most liquid tokens over the last ~24h (bots/relayers removed). Use for 'who is winning', 'top traders', 'smart money buying'.",
      parameters: { type: "object", properties: { sort: { type: "string", enum: ["pnl", "volume", "trades"] } } },
    },
  },
  {
    type: "function",
    function: {
      name: "scan_contract",
      description: "Contract X-ray straight from the chain bytecode: can the owner mint, blacklist wallets, pause, change taxes/limits, switch trading off, or upgrade the code? Is ownership renounced? Use for 'is the contract safe', 'can they rug', 'renounced?', 'honeypot', or any token/contract address.",
      parameters: { type: "object", properties: { token: { type: "string", description: "Symbol, token address or pool address" } }, required: ["token"] },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_tokens",
      description: "Side-by-side comparison of 2–4 Robinhood Chain tokens: price, 24h change, liquidity, volume, FDV, pool age, risk level and flags. Use for 'X vs Y', 'compare', 'which is safer'.",
      parameters: { type: "object", properties: { tokens: { type: "array", items: { type: "string" }, description: "2–4 symbols or addresses" } }, required: ["tokens"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_watchlist",
      description: "The user's own saved watchlist tokens (with live price, 24h change, liquidity, risk), their active price alerts (with distance to trigger) and followed wallets. Use for 'my tokens', 'my watchlist', 'my alerts', 'brief me', 'how are my coins'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_price_alert",
      description: "ACTION: create a price alert for the user (fires a sound + browser notification when price crosses the level). Give either an absolute USD price or a percent move from the current price (e.g. -10 for 'if it drops 10%'). Use when the user says 'alert me', 'notify me', 'kasih tau kalau'.",
      parameters: { type: "object", properties: { token: { type: "string" }, price: { type: "number", description: "USD level" }, percent: { type: "number", description: "% move from now, negative = drop" } }, required: ["token"] },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_watchlist",
      description: "ACTION: add a token to (or remove it from) the user's watchlist. Use for 'watch X', 'add X to my list', 'pantau X', 'remove X'.",
      parameters: { type: "object", properties: { op: { type: "string", enum: ["add", "remove"] }, token: { type: "string" } }, required: ["op", "token"] },
    },
  },
  {
    type: "function",
    function: {
      name: "follow_wallet",
      description: "ACTION: follow (or unfollow) a wallet address so the user can track it from the Wallet page and their briefings.",
      parameters: { type: "object", properties: { address: { type: "string" }, unfollow: { type: "boolean" }, label: { type: "string" } }, required: ["address"] },
    },
  },
] as const;

type ToolResult = { data: unknown; summary: string; focus?: { pool: string; interval: Interval }; card?: Card; action?: AgentAction };

const WEB_ONLY = "Alerts, the watchlist and followed wallets live in the Strix web app (they are saved in the user's browser). Tell the user to ask this in the Strix web app.";

export async function runTool(name: string, args: Record<string, unknown>, ctx: AgentCtx = {}): Promise<ToolResult> {
  switch (name) {
    case "scan_contract": {
      const q = String(args.token ?? "").trim();
      let address = q, symbol = q, pool: string | null = null;
      try {
        const t = await getPool(await resolvePool(q));
        address = t.address;
        symbol = t.symbol;
        pool = t.pool;
      } catch (e) {
        if (!isAddress(q)) throw e; // a raw contract address can be scanned even if no DEX indexes its pool yet
      }
      const c = await scanContract(address, symbol);
      return {
        data: { symbol, tokenAddress: c.address, ...c, findings: c.findings.map(({ label, severity, detail }) => ({ label, severity, detail })) },
        summary: `${symbol}: ${c.verdict}${c.findings.filter((f) => f.severity !== "info").length ? " · " + c.findings.filter((f) => f.severity !== "info").map((f) => f.label).join(", ") : ""}`,
        ...(pool ? { focus: { pool, interval: "1h" as Interval } } : {}),
        card: {
          kind: "contract", symbol, address: c.address, verdict: c.verdict, sizeBytes: c.sizeBytes,
          owner: c.owner ? (c.owner.renounced ? "renounced" : c.owner.address) : c.roleBased ? "admin roles" : "none",
          proxy: c.proxy ? (c.proxy.upgradeable ? `upgradeable by ${c.proxy.upgrader}` : "locked proxy") : null,
          findings: c.findings.map(({ label, severity, detail }) => ({ label, severity, detail })), note: c.note,
        },
      };
    }
    case "compare_tokens": {
      const list = (Array.isArray(args.tokens) ? args.tokens : String(args.tokens ?? "").split(/[\s,]+/)).map(String).filter(Boolean).slice(0, 4);
      if (list.length < 2) throw new Error("Give at least two tokens to compare");
      const rows = await Promise.all(
        list.map(async (q) => {
          const t = await getPool(await resolvePool(q));
          const r = risksFor(t);
          return { t, r };
        })
      );
      return {
        data: rows.map(({ t }) => brief(t)),
        summary: rows.map(({ t, r }) => `${t.symbol} ${r.level}`).join(" vs "),
        card: {
          kind: "compare",
          rows: rows.map(({ t, r }) => ({
            symbol: t.symbol, pool: t.pool, price: t.price, h24: t.change.h24, liquidity: t.liquidity, volume24h: t.volume.h24, fdv: t.fdv,
            ageDays: t.ageHours != null ? +(t.ageHours / 24).toFixed(1) : null, risk: r.level, flags: r.flags.map((f) => RISKS[f].label),
          })),
        },
      };
    }
    case "get_my_watchlist": {
      if (!ctx.web) throw new Error(WEB_ONLY);
      const watch = (ctx.watchlist ?? []).slice(0, 10);
      const alerts = (ctx.alerts ?? []).slice(0, 15);
      const tokens = (await Promise.all(watch.map((w) => getPool(w.pool).catch(() => null)))).filter((t): t is Token => !!t);
      const alertPrices = alerts.length ? await getPrices([...new Set(alerts.map((a) => a.pool))]).catch(() => ({} as Record<string, number | null>)) : {};
      const al = alerts.map((a) => {
        const now = alertPrices[a.pool.toLowerCase()] ?? alertPrices[a.pool] ?? null;
        return { symbol: a.symbol, alertPrice: a.price, direction: a.dir, currentPrice: now, distancePct: now ? +(((a.price - now) / now) * 100).toFixed(2) : null };
      });
      return {
        data: {
          watchlist: tokens.map(brief),
          activeAlerts: al,
          followedWallets: (ctx.wallets ?? []).slice(0, 10),
          ...(watch.length || alerts.length || ctx.wallets?.length ? {} : { empty: "The user has no watchlist, alerts or followed wallets yet. Offer to add some (manage_watchlist / set_price_alert / follow_wallet)." }),
        },
        summary: `${tokens.length} watched · ${al.length} alerts · ${ctx.wallets?.length ?? 0} wallets`,
        card: {
          kind: "watchlist",
          items: tokens.map((t) => ({ symbol: t.symbol, pool: t.pool, price: t.price, h24: t.change.h24, liquidity: t.liquidity, risk: risksFor(t).level })),
          alerts: al.map((a) => ({ symbol: a.symbol, price: a.alertPrice, dir: a.direction, distancePct: a.distancePct })),
          wallets: ctx.wallets?.length ?? 0,
        },
      };
    }
    case "set_price_alert": {
      if (!ctx.web) throw new Error(WEB_ONLY);
      const pool = await resolvePool(String(args.token));
      const t = await getPool(pool);
      if (!(t.price > 0)) throw new Error(`No live price for ${t.symbol}`);
      const pct = args.percent != null && isFinite(Number(args.percent)) ? Number(args.percent) : null;
      const level = Number(args.price) > 0 ? Number(args.price) : pct != null ? t.price * (1 + pct / 100) : NaN;
      if (!(level > 0)) throw new Error("Give a price level or a percent move for the alert");
      const dir = level >= t.price ? "above" : "below";
      const move = ((level - t.price) / t.price) * 100;
      return {
        data: { done: true, symbol: t.symbol, pool, currentPrice: t.price, alertPrice: level, direction: dir, movePct: +move.toFixed(2), note: "Saved in the user's browser. It fires with a sound + notification while any Strix tab is open (checked every minute)." },
        summary: `Alert set: ${t.symbol} ${dir === "above" ? "≥" : "≤"} $${fmt(level)} (${move >= 0 ? "+" : ""}${move.toFixed(1)}%)`,
        action: { kind: "alert", pool, symbol: t.symbol, price: level, dir },
        card: { kind: "action", icon: "🔔", text: `Alert set — ${t.symbol} ${dir} $${fmt(level)} (now $${fmt(t.price)}, ${move >= 0 ? "+" : ""}${move.toFixed(1)}%)`, href: `/app?pool=${pool}` },
      };
    }
    case "manage_watchlist": {
      if (!ctx.web) throw new Error(WEB_ONLY);
      const op = args.op === "remove" ? "remove" : "add";
      const pool = await resolvePool(String(args.token));
      const t = await getPool(pool);
      return {
        data: { done: true, op, symbol: t.symbol, pool, priceUsd: t.price, risk: risksFor(t).level },
        summary: `${op === "add" ? "Watching" : "Removed"} ${t.symbol}`,
        action: { kind: "watch", op, pool, symbol: t.symbol },
        card: { kind: "action", icon: op === "add" ? "⭐" : "✕", text: op === "add" ? `Added ${t.symbol} to your watchlist` : `Removed ${t.symbol} from your watchlist`, href: `/app?pool=${pool}` },
      };
    }
    case "follow_wallet": {
      if (!ctx.web) throw new Error(WEB_ONLY);
      const address = String(args.address ?? "").trim();
      if (!isAddress(address)) throw new Error("That is not a valid 0x wallet address");
      const op = args.unfollow ? "remove" : "add";
      const label = String(args.label || `${address.slice(0, 6)}…${address.slice(-4)}`).slice(0, 40);
      return {
        data: { done: true, op, address, label },
        summary: `${op === "add" ? "Following" : "Unfollowed"} ${label}`,
        action: { kind: "follow", op, address, label },
        card: { kind: "action", icon: "👁", text: op === "add" ? `Following wallet ${label}` : `Unfollowed ${label}`, href: `/wallet?address=${address}` },
      };
    }
    case "analyze_token": {
      const interval = (INTERVALS.includes(args.interval as Interval) ? args.interval : "1h") as Interval;
      const pool = await resolvePool(String(args.token));
      const [t, candles] = await Promise.all([getPool(pool), getCandles(pool, interval).catch(() => null)]);
      const ta = candles && candles.length >= 30 ? analyze(candles) : null;
      return {
        data: {
          chain: CHAIN.name, ...brief(t), links: links(t), interval,
          technical: ta
            ? { bias: ta.bias, score: ta.score, reasons: ta.reasons, price: ta.price, ema20: ta.ema20, ema50: ta.ema50, ema200: ta.ema200, rsi: ta.rsi, macdHist: ta.macd.hist, atr: ta.atr, atrPct: ta.atrPct, bollinger: ta.bollinger, support: ta.support.map((s) => s.price), resistance: ta.resistance.map((s) => s.price) }
            : "Not enough candle history yet (new pool) or candle feed busy — rely on on-chain stats.",
        },
        summary: `${t.symbol} ${fmt(t.price)} · 24h ${fmt(t.change.h24)}% · liq ${usd(t.liquidity)}${ta ? ` · RSI ${fmt(ta.rsi, 1)} · ${ta.bias}` : ""}`,
        focus: { pool, interval },
        card: {
          kind: "token", symbol: t.symbol, name: t.name, image: t.image, pool, price: t.price, h1: t.change.h1, h24: t.change.h24, liquidity: t.liquidity,
          volume24h: t.volume.h24, fdv: t.fdv, risk: risksFor(t).level, flags: risksFor(t).flags.map((f) => RISKS[f].label), bias: ta?.bias ?? null,
          rsi: ta?.rsi ?? null, interval, spark: (candles ?? []).slice(-48).map((c) => c.close),
        },
      };
    }
    case "get_chain_overview": {
      const [top, trending, net] = await Promise.all([getTopTokens(), getTrending().catch(() => []), getNetworkStatus().catch(() => null)]);
      const real = top.filter(trusted);
      const liquid = real.filter((t) => t.liquidity > 100_000);
      const byChg = [...liquid].sort((a, b) => b.change.h24 - a.change.h24);
      const line = (t: Token) => ({ symbol: t.symbol, priceUsd: t.price, change24h: t.change.h24, volume24h: Math.round(t.volume.h24), liquidity: Math.round(t.liquidity) });
      return {
        data: {
          network: net, totalVolume24h: Math.round(real.reduce((s, t) => s + t.volume.h24, 0)),
          topByVolume: real.slice(0, 10).map(line), excludedSuspicious: top.length - real.length, gainers: byChg.slice(0, 5).map(line), losers: byChg.slice(-5).reverse().map(line),
          trending: trending.slice(0, 8).map(line),
        },
        summary: `${real.length} tokens · vol ${usd(real.reduce((s, t) => s + t.volume.h24, 0))}${net ? ` · block ${net.block.toLocaleString()}` : ""}`,
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
      const { launches } = await getLaunches();
      const only = String(args.only ?? "all");
      const pick = launches.filter((l) => (only === "safe" ? ["A", "B"].includes(l.grade) && !l.token.copycatOf : only === "risky" ? ["D", "F"].includes(l.grade) || !!l.token.copycatOf : true));
      const bundled = launches.filter((l) => l.reasons.some((r) => r.text.startsWith("Bundled launch"))).length;
      return {
        data: {
          scanned: launches.length,
          bundled,
          launches: pick.slice(0, 12).map((l) => ({
            symbol: l.token.symbol, name: l.token.name, tokenAddress: l.token.address, ageMinutes: Math.round((l.token.ageHours ?? 0) * 60),
            liquidityUsd: Math.round(l.token.liquidity), priceUsd: l.token.price, launchGrade: l.grade, launchScore: l.score,
            firstMinute: l.snipers ? { wallets: l.snipers.buyers, supplyPct: +l.snipers.sharePct.toFixed(1) } : "unknown",
            contract: l.contract?.verdict ?? "unknown", reasons: l.reasons.map((r) => r.text),
            report: `https://strixagents.com/t/${l.token.pool}`,
          })),
        },
        summary: `${launches.length} launches · ${bundled} bundled · ${launches.filter((l) => ["A", "B", "C"].includes(l.grade)).length} graded A–C`,
      };
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
          report: `https://strixagents.com/t/${encodeURIComponent(shareSlug(r.token))}`,
          socials: r.info ? { websites: r.info.websites, twitter: r.info.twitter, telegram: r.info.telegram } : null,
        },
        summary: `${r.token.symbol}: ${r.scorecard.grade} (${r.scorecard.score}/100) · ${r.scorecard.verdict}`,
        focus: { pool, interval: "1h" },
        card: {
          kind: "score", symbol: r.token.symbol, pool, grade: r.scorecard.grade, score: r.scorecard.score, verdict: r.scorecard.verdict,
          checks: r.scorecard.checks.map((c) => ({ label: c.label, status: c.status })), honeypot: String(r.info?.honeypot ?? "unknown"), holders: r.info?.holders?.count ?? null,
        },
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
        card: w
          ? { kind: "whales", symbol: r.token.symbol, pool, pressure: w.pressure, buysUsd: w.buysUsd, sellsUsd: w.sellsUsd, wallets: w.wallets, wash: w.washSuspect, topWallet: w.topAccumulators[0]?.wallet ?? null }
          : undefined,
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
        card: {
          kind: "wallet", address: s.address, valueUsd: s.totalValue, tokens: s.holdings.filter((h) => !h.spam).length, trades: s.activity.swaps, bot: s.isBot,
          top: s.holdings.filter((h) => !h.spam && h.value).slice(0, 4).map((h) => ({ symbol: h.symbol, valueUsd: h.value ?? 0 })),
        },
        summary: `${s.address.slice(0, 8)}…: ${usd(s.totalValue)} · ${s.holdings.filter((h) => !h.spam).length} tokens · ${s.activity.swaps} trades 24h${s.isBot ? " · BOT" : ""}`,
      };
    }
    case "get_news": {
      const n = await getNews(args.topic ? String(args.topic) : undefined, 8);
      return { data: n.map(({ title, date, source }) => ({ title, date, source })), summary: `${n.length} headlines` };
    }
    case "get_rug_radar": {
      const r = await getRadar();
      const ev = r.events.filter((e) => !args.type || e.type === args.type).slice(0, 12);
      return {
        data: {
          watchingPools: r.watching, monitoringSince: new Date(r.monitoringSince).toISOString(), lastScan: r.lastScan ? new Date(r.lastScan).toISOString() : null,
          events: ev.map((e) => ({ type: e.type, severity: e.severity, symbol: e.symbol, token: e.token, title: e.title, detail: e.detail, at: new Date(e.at).toISOString() })),
        },
        card: { kind: "radar", watching: r.watching, events: ev.slice(0, 4).map((e) => ({ symbol: e.symbol, title: e.title, severity: e.severity, pool: e.pool })) },
        summary: `${ev.length} radar events · watching ${r.watching} pools`,
      };
    }
    case "get_smart_money": {
      const s = await getSmartMoney();
      const key = args.sort === "volume" ? "volumeUsd" : args.sort === "trades" ? "trades" : "pnlUsd";
      const top = [...s.traders].sort((a, b) => b[key] - a[key]).slice(0, 10);
      return {
        data: {
          windowHours: s.windowHours, botsRemoved: s.botsRemoved, tokens: s.pools.map((p) => p.symbol),
          traders: top.map((t) => ({ wallet: t.wallet, pnlUsd: Math.round(t.pnlUsd), volumeUsd: Math.round(t.volumeUsd), trades: t.trades, winRate: Math.round(t.winRate * 100), automated: t.automated, positions: t.positions.slice(0, 4).map((p) => `${p.symbol} ${Math.round(p.pnlUsd)}`) })),
        },
        card: { kind: "traders", windowHours: s.windowHours, top: top.slice(0, 5).map((t) => ({ wallet: t.wallet, pnlUsd: t.pnlUsd, volumeUsd: t.volumeUsd, automated: t.automated })) },
        summary: `${s.traders.length} wallets ranked · ${s.botsRemoved} bots removed`,
      };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

const LABELS: Record<string, (a: Record<string, unknown>) => string> = {
  analyze_token: (a) => `Reading ${a.token} on-chain stats & ${a.interval ?? "1h"} candles`,
  get_chain_overview: () => "Pulling Robinhood Chain market overview",
  scan_tokens: (a) => `Scanning ${a.list ?? "top"} tokens${a.signal ? ` for ${a.signal}` : ""}`,
  get_new_launches: (a) => `Running the Launch Scanner${a.only && a.only !== "all" ? ` (${a.only} launches)` : ""} — contracts, first-minute bundles, copycats`,
  search_token: (a) => `Searching for “${a.query}”`,
  get_news: (a) => `Reading Robinhood Chain news${a.topic ? ` about ${a.topic}` : ""}`,
  get_token_scorecard: (a) => `Running safety scorecard on ${a.token} (holders, honeypot, dev wallet…)`,
  get_whale_activity: (a) => `Tracking whale wallets & large trades on ${a.token}`,
  get_stock_premiums: (a) => `Comparing ${a.ticker ?? "stock"} tokens with the real share price`,
  get_rug_radar: () => "Checking the Rug Radar (liquidity pulls, crashes, mints, copycats)",
  get_smart_money: () => "Ranking smart-money wallets (bots removed)",
  scan_contract: (a) => `X-raying the ${a.token} contract bytecode (mint, blacklist, pause, upgrades…)`,
  compare_tokens: (a) => `Comparing ${(Array.isArray(a.tokens) ? a.tokens : [a.tokens]).join(" vs ")}`,
  get_my_watchlist: () => "Reading your watchlist, alerts and followed wallets",
  set_price_alert: (a) => `Setting a price alert on ${a.token}`,
  manage_watchlist: (a) => `${a.op === "remove" ? "Removing" : "Adding"} ${a.token} ${a.op === "remove" ? "from" : "to"} your watchlist`,
  follow_wallet: (a) => `${a.unfollow ? "Unfollowing" : "Following"} wallet ${String(a.address).slice(0, 8)}…`,
  scan_wallet: (a) => `Scanning wallet ${String(a.address).slice(0, 8)}… holdings & 24h trades`,
};

/* ───────────── LLM loop ───────────── */

const SYSTEM = `You are Strix, an honest on-chain AI agent and analyst specialised in Robinhood Chain (Arbitrum Orbit L2, chain ID ${CHAIN.id}, gas in ETH).
Tokens there include memecoins, launchpad tokens, and tokenized stocks (e.g. NVDA, TSLA) quoted in WETH or USDG.
Today is ${new Date().toISOString().slice(0, 10)}.
Rules:
- ALWAYS call tools before giving any number. Never invent prices, levels, liquidity or addresses.
- Only state facts that appear in tool results. Never invent a safety grade or score (only get_token_scorecard gives one), never list contract functions, owners or implementation addresses that scan_contract did not return, and say "not checked" instead of guessing.
- Token question → analyze_token (1h by default; add 4h/1d for swing context). Market question → get_chain_overview. Discovery → scan_tokens / get_new_launches (the Launch Scanner: each launch has a launch grade and reasons; call out bundled launches clearly).
- Never call a new launch "safe": a launch grade only means fewer red flags so far. Say "fewest red flags" and remind that brand-new tokens are high risk. A copycat is never a good pick.
- When a tool returns a "report" link, end safety answers with it as a Markdown link (e.g. "Full report: [strixagents.com/t/PONS](https://strixagents.com/t/PONS)") so the user can share it.
- You are a research agent, not a trading bot. Never tell the user what to buy or sell, never give entry / stop-loss / take-profit prices, position sizes or "long/short" setups, and never call anything "recommended" / "rekomendasi". If asked for a trade plan, say you only research and explain on-chain data and risk.
- Safety questions ("aman ga?", rug, holder, trust) → get_token_scorecard. Whale / smart-money questions → get_whale_activity. For a full token review, call analyze_token AND get_token_scorecard.
- Stock tokens vs real shares → get_stock_premiums. A wallet address (0x + 40 hex) → scan_wallet. If a wallet looksLikeBot, say it is a bot/relayer and should not be copied.
- You can ACT for the user: set_price_alert ("alert me if…", "kasih tau kalau…"), manage_watchlist ("watch X", "pantau X"), follow_wallet. Do it when asked, then confirm in one line what was set. Percent requests ("if it drops 10%") → pass percent: -10.
- "My tokens / my watchlist / my alerts / brief me" → get_my_watchlist (then add get_rug_radar for a briefing and warn if any watched token appears there or is High risk).
- Comparing 2–4 tokens → compare_tokens (one call), then explain the differences in a table.
- Contract questions ("can they rug / mint / blacklist", "renounced?", a contract address) → scan_contract. For issuer assets (official stock tokens, stablecoins) explain that admin powers are expected there.
- If the message contains "[Image attached …]": first say in one line what you read (token symbols / addresses) so the user can verify it, then check each token or address with tools (get_token_scorecard, scan_contract, analyze_token, scan_wallet) and compare every claim in the image ("100x", "liquidity locked", "safe", "renounced") with the real on-chain data. Call out shill and scam patterns plainly. If an address was only partly readable, say so and don't guess it.
- If a token has the "Disguised name" flag, warn loudly: hidden characters make its symbol look like another token (e.g. a fake USDT).
- Rugs / dumps / "anything sketchy right now" → get_rug_radar. Top traders / who is winning → get_smart_money (mention automated wallets and that a short window is noisy).
- If whales.washSuspect is true, say clearly that the volume is likely fake (one wallet trading with itself).
- If a token has the "Possible copycat" flag, say so loudly: another older token uses the same symbol; tell the user to verify the contract address (copycatOf is the original).
- On-chain risk matters as much as the chart: always mention liquidity, FDV vs liquidity, pool age, buy/sell balance and the risk level. Warn clearly on High risk (possible rug, thin liquidity, heavy slippage).
- ALWAYS reply in English, even if the user writes in another language.
- Markdown, concise: **Summary**, **On-chain** (liq, FDV, volume, buys/sells, age), **Chart context** (trend, RSI, key support/resistance zones — descriptive only), **Risks**, **What to watch** (on-chain signals worth monitoring).
- Use tables when comparing tokens. For broad questions, chain several tools (e.g. overview → scorecard on the most interesting token) before answering.
- Plain Markdown only: never use LaTeX or math markup (no dollar-sign math, no backslash commands like \\text or \\gg). Write symbols directly, e.g. "FDV ≫ liquidity".
- The UI already shows live data cards for each tool (price, grade, whales, wallet). Don't repeat every raw number — interpret them: what matters, what is unusual, what to watch next.
- End with a short reminder: research only, not financial advice.`;

type LLM = { name: string; key: string; base: string; model: string; extra?: Record<string, unknown> };

const GROQ_BASE = "https://api.groq.com/openai/v1";
/** Every Groq model has its own free per-minute token budget, so a chain of models multiplies capacity. */
const GROQ_FALLBACKS = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
const GEMINI_DEFAULT = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const csv = (v: string | undefined) => (v ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const uniq = (a: string[]) => [...new Set(a)];

/** Keep "thinking" short: on free tiers a long reasoning phase is what makes answers slow. */
function reasoningFor(model: string): Record<string, unknown> | undefined {
  if (/gpt-oss/.test(model)) return { reasoning_effort: "low" };
  if (/qwen3/.test(model)) return { reasoning_effort: "none" };
  if (/^gemini-/.test(model)) return { reasoning_effort: "low" };
  return undefined;
}

/** Groq models first (fast), then Gemini models (free backup) — all speak the OpenAI chat format. */
function llmProviders(): LLM[] {
  const list: LLM[] = [];
  if (process.env.LLM_API_KEY) {
    const base = (process.env.LLM_BASE_URL || GROQ_BASE).replace(/\/$/, "");
    const primary = csv(process.env.LLM_MODEL);
    const first = primary.length ? primary : ["openai/gpt-oss-120b"];
    const models = base === GROQ_BASE ? uniq([...first, ...csv(process.env.LLM_FALLBACK_MODELS || GROQ_FALLBACKS.join(","))]) : first;
    for (const model of models)
      list.push({ name: `Groq (${model.replace(/^.*\//, "")})`, key: process.env.LLM_API_KEY, base, model, extra: base === GROQ_BASE ? reasoningFor(model) : undefined });
  }
  if (process.env.GEMINI_API_KEY) {
    // if one Gemini model is overloaded (503), out of quota (429) or retired (404), the next is tried
    for (const model of uniq([...csv(process.env.GEMINI_MODEL), ...GEMINI_DEFAULT]))
      list.push({ name: `Gemini (${model})`, key: process.env.GEMINI_API_KEY, base: "https://generativelanguage.googleapis.com/v1beta/openai", model, extra: reasoningFor(model) });
  }
  return list;
}

/** Providers that just failed are skipped until their cooldown ends, so nobody waits on a known-busy model. */
const cooldown = new Map<string, number>();
function coolDown(p: LLM, e: Error) {
  const m = e.message;
  const retryIn = +(m.match(/try again in ([\d.]+)s/)?.[1] ?? 0);
  const daily = /quota|per day|RESOURCE_EXHAUSTED/i.test(m) && !retryIn;
  const secs = daily ? 900 : retryIn || (/LLM 404/.test(m) ? 3600 : /timed out|timeout|aborted/i.test(m) ? 60 : 30);
  cooldown.set(p.name, Date.now() + Math.min(secs, 3600) * 1000);
}
/** Ready providers in their normal order; cooling ones go last (soonest-ready first) as a final resort. */
function byReadiness(list: LLM[]): LLM[] {
  const now = Date.now();
  const ready = list.filter((p) => (cooldown.get(p.name) ?? 0) <= now);
  const cooling = list.filter((p) => (cooldown.get(p.name) ?? 0) > now).sort((a, b) => cooldown.get(a.name)! - cooldown.get(b.name)!);
  return [...ready, ...cooling];
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
async function chatAny(all: LLM[], messages: Msg[], onWait: (s: number) => void, onSwitch: (to: string, why: string) => void, onDelta: (t: string) => void) {
  const providers = byReadiness(all);
  let lastErr: Error | null = null;
  for (let i = 0; i < providers.length; i++) {
    const isLast = i === providers.length - 1;
    try {
      return { ...(await chat(providers[i], messages, isLast ? onWait : null, onDelta, isLast ? 90_000 : 20_000)), model: providers[i].name };
    } catch (e) {
      lastErr = e as Error;
      coolDown(providers[i], lastErr);
      if (!isLast) onSwitch(providers[i + 1].name, reason(lastErr));
    }
  }
  throw lastErr ?? new Error("No AI provider configured");
}

/** Short human reason for a provider failure, e.g. "rate limited", "access denied (403)". */
function reason(e: Error | null) {
  const m = e?.message ?? "";
  const code = m.match(/LLM (\d{3})/)?.[1];
  if (code === "429") return "rate limited";
  if (code === "403") return "access denied (403)";
  if (code === "401") return "invalid key (401)";
  if (code && code >= "500") return `provider error (${code})`;
  if (/timeout|aborted/i.test(m)) return "timed out";
  return code ? `error ${code}` : "unavailable";
}

const isGemini = (cfg: LLM) => cfg.base.includes("generativelanguage.googleapis.com");
/** Tool calls produced by another model have no Gemini thought signature; Gemini accepts this documented placeholder for them. */
function forGemini(messages: Msg[]): Msg[] {
  return messages.map((m) =>
    m.role === "assistant" && m.tool_calls?.length
      ? { ...m, tool_calls: m.tool_calls.map((tc) => (tc.extra_content ? tc : { ...tc, extra_content: { google: { thought_signature: "skip_thought_signature_validator" } } })) }
      : m
  );
}

async function chat(cfg: LLM, messages: Msg[], onWait: ((s: number) => void) | null, onDelta: (t: string) => void, firstByteMs = 90_000) {
  if (isGemini(cfg)) messages = forGemini(messages);
  for (let attempt = 0; ; attempt++) {
    // a provider that hasn't started answering within firstByteMs is abandoned for the next one
    const ctl = new AbortController();
    const firstByte = setTimeout(() => ctl.abort(new Error("timed out waiting for the first token")), firstByteMs);
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.3, stream: true, ...cfg.extra }),
      signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(120_000)]),
    }).finally(() => clearTimeout(firstByte));
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
    if (!(res.headers.get("content-type") ?? "").includes("event-stream") || !res.body) {
      const d = await res.json();
      return d.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
    }
    return readStream(res.body, onDelta);
  }
}

/** Parse an OpenAI-style SSE stream: forward text as it arrives, assemble tool calls. */
async function readStream(body: ReadableStream<Uint8Array>, onDelta: (t: string) => void) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let content = "";
  const calls: ToolCall[] = [];
  type TC = { index?: number; id?: string; function?: { name?: string; arguments?: string }; extra_content?: unknown };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let j: { choices?: { delta?: { content?: string | null; tool_calls?: TC[] } }[]; error?: { message?: string } };
      try { j = JSON.parse(payload); } catch { continue; }
      if (j.error) throw new Error(`LLM stream: ${j.error.message ?? "error"}`);
      const d = j.choices?.[0]?.delta;
      if (!d) continue;
      for (const tc of d.tool_calls ?? []) {
        let slot = tc.index != null ? calls[tc.index] : tc.id ? undefined : calls.at(-1);
        if (!slot) {
          slot = { id: tc.id || `call_${calls.length}_${Date.now()}`, type: "function", function: { name: "", arguments: "" } };
          if (tc.index != null) calls[tc.index] = slot;
          else calls.push(slot);
        }
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.function.name += tc.function.name;
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
        if (tc.extra_content) slot.extra_content = tc.extra_content;
      }
      if (typeof d.content === "string" && d.content) {
        content += d.content;
        if (!calls.length) onDelta(d.content);
      }
    }
  }
  const tool_calls = calls.filter(Boolean);
  return { content: content || null, tool_calls: tool_calls.length ? tool_calls : undefined };
}

/** Suggested next questions, derived from what the agent actually looked at. */
function followups(names: string[], cards: Card[]) {
  const out: string[] = [];
  const has = (n: string) => names.includes(n);
  const tok = [...cards].reverse().find((c) => c.kind === "token" || c.kind === "score" || c.kind === "whales") as { symbol: string } | undefined;
  const sym = tok?.symbol;
  if (sym) {
    if (!has("get_token_scorecard")) out.push(`Is ${sym} safe? Run the full scorecard`);
    if (!has("get_whale_activity")) out.push(`Are whales buying or selling ${sym}?`);
    if (!names.filter((n) => n === "analyze_token").length) out.push(`Analyze ${sym}: trend, liquidity and key levels`);
    else out.push(`${sym} on the 4h chart — bigger picture`);
  }
  const whale = cards.find((c) => c.kind === "whales") as Extract<Card, { kind: "whales" }> | undefined;
  if (whale?.topWallet) out.push(`Scan wallet ${whale.topWallet}`);
  const tr = cards.find((c) => c.kind === "traders") as Extract<Card, { kind: "traders" }> | undefined;
  if (tr?.top[0]) out.push(`Scan wallet ${tr.top[0].wallet}`);
  const w = cards.find((c) => c.kind === "wallet") as Extract<Card, { kind: "wallet" }> | undefined;
  if (w?.top.find((x) => !/^(ETH|WETH|USDG|USDC)$/.test(x.symbol))) out.push(`Is ${w.top.find((x) => !/^(ETH|WETH|USDG|USDC)$/.test(x.symbol))!.symbol} safe?`);
  if (sym && !has("manage_watchlist") && !has("set_price_alert")) out.splice(1, 0, `Watch ${sym} and alert me if it drops 10%`);
  const cmp = cards.find((c) => c.kind === "compare") as Extract<Card, { kind: "compare" }> | undefined;
  if (cmp) out.push(...cmp.rows.slice(0, 2).map((r) => `Is ${r.symbol} safe? Run the full scorecard`));
  if (!has("get_rug_radar")) out.push("Any rugs or copycats on the radar right now?");
  if (!has("get_smart_money")) out.push("Who are the top traders today (bots removed)?");
  if (!has("get_chain_overview")) out.push("How is Robinhood Chain doing today?");
  return [...new Set(out)].slice(0, 3);
}

/**
 * Identical first questions (e.g. the suggested prompts, clicked by many people at once) share one run:
 * a request that arrives while the same question is being answered joins it, and for two minutes after,
 * the finished answer is replayed instead of spending the free AI budget again. Personal context
 * (watchlist, wallets, alerts, a screenshot) or a follow-up question always gets its own run.
 */
type Shared = { at: number; done: boolean; keep: boolean; events: AgentEvent[]; subs: Set<(e: AgentEvent) => void>; finished: Promise<void> };
const SHARED_TTL = 120_000;
const shared = new Map<string, Shared>();
function shareKey(history: { role: string; content: string }[], ctx: AgentCtx): string | null {
  if (history.length !== 1 || ctx.image || ctx.watchlist?.length || ctx.wallets?.length || ctx.alerts?.length) return null;
  const q = history[0].content.trim().toLowerCase().replace(/\s+/g, " ");
  return q && q.length <= 300 ? `${ctx.web ? "web" : "cli"}|${ctx.viewing ?? ""}|${q}` : null;
}

export async function runAgent(history: { role: "user" | "assistant"; content: string }[], emit: (e: AgentEvent) => void, ctx: AgentCtx = {}) {
  const key = shareKey(history, ctx);
  if (!key) return runAgentFresh(history, emit, ctx);
  const now = Date.now();
  for (const [k, v] of shared) if (v.done && now - v.at > SHARED_TTL) shared.delete(k);
  const existing = shared.get(key);
  if (existing) {
    const t0 = Date.now();
    const out = (e: AgentEvent) => emit(e.t === "meta" ? { ...e, ms: Date.now() - t0 } : e);
    existing.events.forEach(out);
    if (!existing.done) {
      existing.subs.add(out);
      await existing.finished;
      existing.subs.delete(out);
    }
    return;
  }
  let finish!: () => void;
  const entry: Shared = { at: now, done: false, keep: true, events: [], subs: new Set(), finished: new Promise<void>((r) => (finish = r)) };
  shared.set(key, entry);
  try {
    await runAgentFresh(history, (e) => {
      entry.events.push(e);
      // the rule-based fallback (all AI busy) is not worth replaying — the next asker should get a real answer
      if (e.t === "meta" && e.model === "rule-based") entry.keep = false;
      emit(e);
      entry.subs.forEach((s) => s(e));
    }, ctx);
  } catch (e) {
    entry.keep = false;
    throw e;
  } finally {
    entry.done = true;
    entry.at = Date.now();
    if (!entry.keep) shared.delete(key);
    finish();
  }
}

async function runAgentFresh(history: { role: "user" | "assistant"; content: string }[], emit: (e: AgentEvent) => void, ctx: AgentCtx = {}) {
  const t0 = Date.now();
  const names: string[] = [];
  const cards: Card[] = [];
  const em = (e: AgentEvent) => {
    if (e.t === "step" && e.name !== "wait" && e.name !== "switch") names.push(e.name);
    if (e.t === "card") cards.push(e.card);
    emit(e);
  };
  // a screenshot is read once, then the agent checks what it shows against live data
  if (ctx.image && history.length) {
    em({ t: "step", id: "v0", name: "read_image", label: "Reading your image (tokens, addresses, claims)" });
    try {
      const seen = await readImage(ctx.image);
      em({ t: "step_done", id: "v0", ok: true, summary: visionSummary(seen) });
      const last = history[history.length - 1];
      history = [...history.slice(0, -1), { ...last, content: `${last.content}

[Image attached — what the vision model read from it:]
${seen}` }];
    } catch (e) {
      em({ t: "step_done", id: "v0", ok: false, summary: (e as Error).message.slice(0, 140) });
    }
  }
  const model = await agentLoop(history, em, ctx);
  emit({ t: "followups", items: followups(names, cards) });
  emit({ t: "meta", model, ms: Date.now() - t0, tools: names.length });
}

async function agentLoop(history: { role: "user" | "assistant"; content: string }[], emit: (e: AgentEvent) => void, ctx: AgentCtx): Promise<string> {
  let providers = llmProviders();
  if (!providers.length) {
    await runFallback(history.at(-1)?.content ?? "", emit, "nokey");
    return "rule-based";
  }

  // keep earlier answers short in the context so we stay within the free token budget
  const trimmed = history.slice(-8).map((m, i, arr) => (m.role === "assistant" && i < arr.length - 1 ? { ...m, content: m.content.slice(0, 1200) } : m));
  const viewing = ctx.viewing ? `\nThe user currently has ${ctx.viewing} open on the chart: "this token", "it" or "ini" means ${ctx.viewing} unless they name another.` : "";
  const messages: Msg[] = [{ role: "system", content: SYSTEM + viewing }, ...trimmed];
  let stepN = 0;
  let waitN = 0;
  let streamed = false;
  const onDelta = (text: string) => {
    streamed = true;
    emit({ t: "delta", text });
  };
  for (let iter = 0; iter < 7; iter++) {
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
        (to, why) => {
          const id = `w${waitN++}`;
          emit({ t: "step", id, name: "switch", label: `AI model busy — switching to ${to}` });
          emit({ t: "step_done", id, ok: true, summary: `using ${to} · ${why}` });
          if (streamed) emit({ t: "reset" });
          streamed = false;
          // keep using the backup for the rest of this answer
          providers = providers.slice(Math.max(0, providers.findIndex((p) => p.name === to)));
        },
        onDelta
      );
    } catch (e) {
      if (streamed) emit({ t: "reset" });
      emit({ t: "error", message: (e as Error).message });
      await runFallback(history.at(-1)?.content ?? "", emit, "busy");
      return "rule-based";
    }
    if (!msg.tool_calls?.length) {
      if (!msg.content?.trim()) {
        // a provider occasionally ends with no text — never show an empty answer, use the live-data report instead
        if (streamed) emit({ t: "reset" });
        await runFallback(history.at(-1)?.content ?? "", emit, "busy");
        return "rule-based";
      }
      emit({ t: "answer", text: msg.content });
      return msg.model;
    }
    if (streamed) emit({ t: "reset" });
    streamed = false;
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    // all tool calls of one step run in parallel (the data clients queue/rate-limit themselves)
    const calls = msg.tool_calls.map((tc) => {
      const id = `s${stepN++}`;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      emit({ t: "step", id, name: tc.function.name, label: (LABELS[tc.function.name] ?? (() => tc.function.name))(args) });
      return { tc, id, args };
    });
    const results = await Promise.all(
      calls.map(async ({ tc, id, args }) => {
        try {
          const r = await runTool(tc.function.name, args, ctx);
          if (r.focus) emit({ t: "focus", ...r.focus });
          emit({ t: "step_done", id, ok: true, summary: r.summary });
          if (r.card) emit({ t: "card", card: r.card });
          if (r.action) emit({ t: "action", action: r.action });
          return compact(r.data);
        } catch (e) {
          emit({ t: "step_done", id, ok: false, summary: (e as Error).message });
          return JSON.stringify({ error: (e as Error).message });
        }
      })
    );
    calls.forEach(({ tc }, i) => messages.push({ role: "tool", tool_call_id: tc.id, content: results[i] }));
  }
  emit({ t: "answer", text: "I hit my step limit — try a more specific question." });
  return providers[0]?.name ?? "AI";
}

/* ───────────── no-LLM fallback: rule-based reports from real data ───────────── */

async function step(id: string, name: string, args: Record<string, unknown>, emit: (e: AgentEvent) => void) {
  emit({ t: "step", id, name, label: LABELS[name](args) });
  try {
    const r = await runTool(name, args);
    if (r.focus) emit({ t: "focus", ...r.focus });
    emit({ t: "step_done", id, ok: true, summary: r.summary });
    if (r.card) emit({ t: "card", card: r.card });
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
const END = "*Research only — not financial advice.*";
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
    type L = { symbol: string; ageMinutes: number; liquidityUsd: number; launchGrade: string; launchScore: number; reasons: string[]; report: string };
    const d = r?.data as { scanned: number; bundled: number; launches: L[] } | undefined;
    const rows = (d?.launches ?? []).map((l) => `| **${l.symbol}** | ${l.launchGrade} (${l.launchScore}) | ${l.ageMinutes}m | ${usd(l.liquidityUsd)} | ${l.reasons[0] ?? "—"} | [report](${l.report}) |`);
    return emit({
      t: "answer",
      text: `### Launch Scanner — newest tokens on Robinhood Chain\n${NOTE}\n\n${d ? `${d.scanned} launches in the last 24h, **${d.bundled} bundled** (many wallets taking a large share of supply in the first minute).\n\n` : ""}| Token | Launch grade | Age | Liquidity | Main reason | |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n\nNew launches are the riskiest corner of any chain — check the full report before buying.\n\n${END}`,
    });
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

${ta ? `**Technical (1h):** RSI ${fmt(ta.rsi, 1)} · MACD hist ${fmt((ta as unknown as { macdHist?: number }).macdHist ?? ta.macd?.hist, 4)} · EMA20/50/200 ${fmt(ta.ema20)} / ${fmt(ta.ema50)} / ${fmt(ta.ema200)}
**Why:** ${ta.reasons.join("; ")}.

**Support:** ${lv(ta.support)}
**Resistance:** ${lv(ta.resistance)}

_Support/resistance are descriptive zones from past swings, not trade signals._` : "_Not enough candle history for technicals yet._"}

[Explorer](${d.links.explorer}) · [GeckoTerminal](${d.links.geckoterminal}) · [DexScreener](${d.links.dexscreener})

${END}`,
  });
}
