import { cached, swr } from "./cache";
import { getTopTokens, gt, type Token } from "./rhchain";

/**
 * Tokenized stocks on Robinhood Chain vs the real stock on its exchange.
 * Official tokens are named "<Company> • Robinhood Token"; anything else using the ticker is treated as a lookalike.
 */

// Fallback list of popular US stocks / ETFs. Tickers are also discovered automatically (search + top list).
const TICKERS = [
  "NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NFLX", "AMD", "AVGO", "ORCL", "INTC", "PLTR", "COIN", "HOOD", "MSTR",
  "CRCL", "UBER", "SHOP", "SMCI", "ARM", "TSM", "BABA", "JPM", "V", "MA", "WMT", "COST", "DIS", "NKE",
  "SPY", "QQQ", "IWM", "DIA", "GLD", "SLV", "USO", "ARKK", "SPCX",
];

const OFFICIAL = /\s•\s*Robinhood Token\s*$/i;
const yahooSymbol = (t: string) => t.replace(".", "-");

type DSPair = {
  chainId: string; pairAddress: string; dexId: string; labels?: string[];
  baseToken: { address: string; symbol: string; name: string }; quoteToken: { symbol: string };
  priceUsd?: string; priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number }; volume?: { h1?: number; h6?: number; h24?: number };
  txns?: { h1?: { buys: number; sells: number }; h24?: { buys: number; sells: number } }; liquidity?: { usd?: number };
  fdv?: number; marketCap?: number; pairCreatedAt?: number; info?: { imageUrl?: string };
};

function toToken(p: DSPair, totalVolume: number): Token {
  return {
    pool: p.pairAddress, poolName: `${p.baseToken.symbol} / ${p.quoteToken.symbol}`, dex: p.dexId,
    address: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name.trim(), image: p.info?.imageUrl ?? null, quote: p.quoteToken.symbol,
    price: +(p.priceUsd ?? 0),
    change: { m5: p.priceChange?.m5 ?? 0, h1: p.priceChange?.h1 ?? 0, h6: p.priceChange?.h6 ?? 0, h24: p.priceChange?.h24 ?? 0 },
    volume: { h1: p.volume?.h1 ?? 0, h6: p.volume?.h6 ?? 0, h24: totalVolume },
    txns: { h1: { buys: p.txns?.h1?.buys ?? 0, sells: p.txns?.h1?.sells ?? 0 }, h24: { buys: p.txns?.h24?.buys ?? 0, sells: p.txns?.h24?.sells ?? 0, buyers: 0, sellers: 0 } },
    liquidity: p.liquidity?.usd ?? 0, fdv: p.fdv ?? null, mcap: p.marketCap ?? null,
    createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    ageHours: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null,
  };
}

export type StockToken = { ticker: string; token: Token; totalLiquidity: number; pools: number; lookalikes: { address: string; name: string; liquidity: number }[] };

async function findTicker(ticker: string): Promise<StockToken | null> {
  return cached(`stock:find:${ticker}`, 30 * 60_000, async () => {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(ticker)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const pairs = (((await res.json()) as { pairs?: DSPair[] }).pairs ?? []).filter((p) => p.chainId === "robinhood" && p.baseToken.symbol.toUpperCase() === ticker);
    const byToken = new Map<string, { pairs: DSPair[]; liq: number; vol: number; name: string }>();
    for (const p of pairs) {
      const k = p.baseToken.address.toLowerCase();
      const e = byToken.get(k) ?? { pairs: [], liq: 0, vol: 0, name: p.baseToken.name };
      e.pairs.push(p);
      e.liq += p.liquidity?.usd ?? 0;
      e.vol += p.volume?.h24 ?? 0;
      byToken.set(k, e);
    }
    const official = [...byToken.entries()].filter(([, e]) => OFFICIAL.test(e.name)).sort((a, b) => b[1].liq - a[1].liq)[0];
    if (!official) return null;
    const [addr, e] = official;
    const best = [...e.pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return {
      ticker,
      token: toToken(best, e.vol),
      totalLiquidity: e.liq,
      pools: e.pairs.length,
      lookalikes: [...byToken.entries()].filter(([a]) => a !== addr).map(([address, x]) => ({ address, name: x.name.trim(), liquidity: x.liq })),
    };
  });
}

/** Discover official stock tokens automatically: GeckoTerminal pool search for "Robinhood Token" (a few pages). */
async function discoverTickers(): Promise<string[]> {
  return swr("stock:discover", 30 * 60_000, async () => {
    const found = new Set<string>();
    for (let page = 1; page <= 5; page++) {
      const d = await gt<{ data: { relationships: { base_token: { data: { id: string } } } }[]; included?: { id: string; attributes: { name: string; symbol: string } }[] }>(
        `/search/pools?query=${encodeURIComponent("Robinhood Token")}&network=robinhood&page=${page}&include=base_token`,
        "low"
      ).catch(() => null);
      if (!d?.data?.length) break;
      const inc = new Map((d.included ?? []).map((x) => [x.id, x.attributes]));
      for (const p of d.data) {
        const b = inc.get(p.relationships.base_token.data.id);
        if (b && OFFICIAL.test(b.name) && /^[A-Za-z.]{1,6}$/.test(b.symbol)) found.add(b.symbol.toUpperCase());
      }
    }
    return [...found];
  });
}

/** All official stock tokens we can find on Robinhood Chain. */
export async function getStockTokens(): Promise<StockToken[]> {
  return swr("stock:tokens", 10 * 60_000, async () => {
    const top = await getTopTokens().catch(() => [] as Token[]);
    const extra = top.filter((t) => OFFICIAL.test(t.name)).map((t) => t.symbol.toUpperCase());
    const discovered = await discoverTickers().catch(() => [] as string[]);
    const tickers = [...new Set([...discovered, ...extra, ...TICKERS])];
    const out: StockToken[] = [];
    for (let i = 0; i < tickers.length; i += 8) {
      const found = await Promise.all(tickers.slice(i, i + 8).map((t) => findTicker(t).catch(() => null)));
      out.push(...(found.filter(Boolean) as StockToken[]));
    }
    return out;
  });
}

/* ───────────── real stock quotes (Yahoo Finance) ───────────── */

type Spark = { symbol: string; close: (number | null)[]; timestamp: number[]; chartPreviousClose?: number; previousClose?: number; start?: number; end?: number };
export type StockQuote = { symbol: string; price: number; previousClose: number | null; lastTradeAt: string; marketOpen: boolean };

async function stockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
  const out = new Map<string, StockQuote>();
  for (let i = 0; i < tickers.length; i += 20) {
    const chunk = tickers.slice(i, i + 20).map(yahooSymbol);
    const data = await cached(`yahoo:spark:${chunk.join(",")}`, 60_000, async () => {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${chunk.join(",")}&range=1d&interval=5m`, {
        headers: { "User-Agent": "Mozilla/5.0 (StrixBot; market-research)" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Yahoo ${res.status}`);
      return (await res.json()) as Record<string, Spark>;
    }).catch(() => ({}) as Record<string, Spark>);
    for (const [sym, s] of Object.entries(data)) {
      const idx = s.close?.map((c, k) => (c != null ? k : -1)).filter((k) => k >= 0).at(-1);
      if (idx == null || idx < 0) continue;
      const last = s.timestamp[idx];
      const now = Date.now() / 1000;
      out.set(sym.replace("-", "."), {
        symbol: sym,
        price: s.close[idx] as number,
        previousClose: s.chartPreviousClose ?? s.previousClose ?? null,
        lastTradeAt: new Date(last * 1000).toISOString(),
        // the regular session is open if the last 5m bar is recent and we are before the session end
        marketOpen: s.end != null ? now < s.end && now - last < 20 * 60 : now - last < 20 * 60,
      });
    }
  }
  return out;
}

export type PremiumRow = {
  ticker: string; name: string; tokenAddress: string; pool: string; image: string | null;
  tokenPrice: number; tokenChange24h: number; liquidity: number; volume24h: number; pools: number;
  stockPrice: number | null; stockPrevClose: number | null; stockChangePct: number | null; marketOpen: boolean; lastStockTrade: string | null;
  premiumPct: number | null; lookalikes: number;
};

export async function getStockPremiums(): Promise<{ rows: PremiumRow[]; marketOpen: boolean; updatedAt: number }> {
  return cached("stock:premiums", 30_000, async () => {
    const tokens = await getStockTokens();
    const quotes = await stockQuotes(tokens.map((t) => t.ticker));
    const rows: PremiumRow[] = tokens.map((s) => {
      const q = quotes.get(s.ticker) ?? null;
      const premium = q && q.price > 0 && s.token.price > 0 ? (s.token.price / q.price - 1) * 100 : null;
      return {
        ticker: s.ticker, name: s.token.name.replace(OFFICIAL, "").trim(), tokenAddress: s.token.address, pool: s.token.pool, image: s.token.image,
        tokenPrice: s.token.price, tokenChange24h: s.token.change.h24, liquidity: s.totalLiquidity, volume24h: s.token.volume.h24, pools: s.pools,
        stockPrice: q?.price ?? null, stockPrevClose: q?.previousClose ?? null,
        stockChangePct: q?.price && q.previousClose ? (q.price / q.previousClose - 1) * 100 : null,
        marketOpen: q?.marketOpen ?? false, lastStockTrade: q?.lastTradeAt ?? null,
        // a gap above 25% almost certainly means the token is not 1:1 with the share — don't present it as a premium
        premiumPct: premium != null && Math.abs(premium) < 25 ? premium : null,
        lookalikes: s.lookalikes.length,
      };
    });
    rows.sort((a, b) => b.liquidity - a.liquidity);
    return { rows, marketOpen: rows.some((r) => r.marketOpen), updatedAt: Date.now() };
  });
}
