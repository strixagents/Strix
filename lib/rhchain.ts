import { cached, peek, put, swr } from "./cache";
import { postJson } from "./net";

/* ───────────── Robinhood Chain config ───────────── */

export const CHAIN = {
  id: 4663,
  hexId: "0x1237",
  name: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  native: { name: "Ether", symbol: "ETH", decimals: 18 },
} as const;

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Interval = "15m" | "1h" | "4h" | "1d" | "1w";
export const INTERVALS: Interval[] = ["15m", "1h", "4h", "1d", "1w"];

/* ───────────── GeckoTerminal client (throttled) ───────────── */

const CG_KEY = process.env.COINGECKO_API_KEY;
const NET = "robinhood";

/**
 * Two GeckoTerminal providers, each behind its own worker + token bucket (shaped like the real limit),
 * so we stay under the limits instead of hitting 429s:
 *  - "public": keyless api.geckoterminal.com — measured burst ~4, then ~1 call / 13-20s. Used for background lists.
 *  - "key":    CoinGecko Demo key (if set) — fast, but capped at 10k calls/month, so it is only spent on what a
 *              user is looking at right now (candles, a single pool, search). Falls back to "public" on failure.
 * Each provider has two lanes: "high" (user-facing) always goes before "low" (background refresh).
 */
type Job = { path: string; tries: number; resolve: (v: unknown) => void; reject: (e: Error) => void };
type Provider = {
  base: string; headers: Record<string, string>; burst: number; refillMs: number; retryMs: number;
  high: Job[]; low: Job[]; tokens: number; refillAt: number; blockedUntil: number; running: boolean; disabledUntil: number;
};
// One set of rate limiters for the whole server process (shared across route bundles).
const P = ((globalThis as unknown as { __strixGT2?: Record<"public" | "key", Provider> }).__strixGT2 ??= {
  public: {
    base: "https://api.geckoterminal.com/api/v2", headers: {}, burst: 4, refillMs: 13_000, retryMs: 20_000,
    high: [], low: [], tokens: 4, refillAt: Date.now(), blockedUntil: 0, running: false, disabledUntil: 0,
  },
  key: {
    base: "https://api.coingecko.com/api/v3/onchain", headers: CG_KEY ? { "x-cg-demo-api-key": CG_KEY } : {}, burst: 8, refillMs: 2_000, retryMs: 10_000,
    high: [], low: [], tokens: 8, refillAt: Date.now(), blockedUntil: 0, running: false, disabledUntil: 0,
  },
});

function refill(q: Provider) {
  const now = Date.now();
  const add = Math.floor((now - q.refillAt) / q.refillMs);
  if (add > 0) {
    q.tokens = Math.min(q.burst, q.tokens + add);
    q.refillAt += add * q.refillMs;
  }
  if (q.tokens >= q.burst) q.refillAt = now;
}

async function worker(q: Provider, fallback?: Provider) {
  if (q.running) return;
  q.running = true;
  try {
    for (;;) {
      if (!q.high.length && !q.low.length) break;
      // wait for a token first, then pick — so a user request that arrives meanwhile still goes first
      for (;;) {
        refill(q);
        const wait = Math.max(q.blockedUntil - Date.now(), q.tokens >= 1 ? 0 : q.refillAt + q.refillMs - Date.now());
        if (wait <= 0) break;
        await new Promise((r) => setTimeout(r, Math.min(wait, 500)));
      }
      const lane = q.high.length ? q.high : q.low;
      const job = lane.shift();
      if (!job) continue;
      q.tokens -= 1;
      try {
        const res = await fetch(`${q.base}${job.path}`, {
          headers: { Accept: "application/json", ...q.headers },
          cache: "no-store",
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429 || ((res.status === 401 || res.status === 403) && fallback)) {
          if (fallback && res.status !== 429) {
            // key rejected / monthly quota used up → stop using it for an hour, hand the job to the public API
            q.disabledUntil = Date.now() + 3_600_000;
            enqueue(fallback, job, "high");
            continue;
          }
          q.blockedUntil = Date.now() + q.retryMs;
          q.tokens = 0;
          q.refillAt = Date.now();
          if (++job.tries < 3) lane.unshift(job);
          else if (fallback) enqueue(fallback, { ...job, tries: 0 }, "high");
          else job.reject(new Error("Data provider is rate-limited — try again in a minute"));
          continue;
        }
        if (!res.ok) job.reject(new Error(`GeckoTerminal ${res.status}`));
        else job.resolve(await res.json());
      } catch (e) {
        job.reject(e as Error);
      }
    }
  } finally {
    q.running = false;
  }
}

function enqueue(q: Provider, job: Job, lane: "high" | "low") {
  q[lane].push(job);
  worker(q, q === P.key ? P.public : undefined);
}

export function gt<T>(path: string, priority: "high" | "low" = "low"): Promise<T> {
  const useKey = priority === "high" && !!CG_KEY && Date.now() > P.key.disabledUntil;
  return new Promise<T>((resolve, reject) => {
    enqueue(useKey ? P.key : P.public, { path, tries: 0, resolve: resolve as (v: unknown) => void, reject }, priority);
  });
}

/* ───────────── pool / token model ───────────── */

type GTWindow<T> = { m5?: T; m15?: T; m30?: T; h1?: T; h6?: T; h24?: T };
type GTPool = {
  id: string;
  attributes: {
    address: string; name: string; pool_created_at: string | null;
    base_token_price_usd: string | null; fdv_usd: string | null; market_cap_usd: string | null; reserve_in_usd: string | null;
    price_change_percentage: GTWindow<string>;
    transactions: GTWindow<{ buys: number; sells: number; buyers?: number; sellers?: number }>;
    volume_usd: GTWindow<string>;
  };
  relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } }; dex: { data: { id: string } } };
};
type GTIncluded = { id: string; type: string; attributes: { address?: string; name: string; symbol?: string; image_url?: string | null } };
type GTList = { data: GTPool[]; included?: GTIncluded[] };

export type Token = {
  pool: string; poolName: string; dex: string;
  address: string; symbol: string; name: string; image: string | null; quote: string;
  price: number; change: { m5: number; h1: number; h6: number; h24: number };
  volume: { h1: number; h6: number; h24: number };
  txns: { h1: { buys: number; sells: number }; h24: { buys: number; sells: number; buyers: number; sellers: number } };
  liquidity: number; fdv: number | null; mcap: number | null; createdAt: string | null; ageHours: number | null;
  /** Another, older token on the chain uses the same symbol. */
  copycatOf?: string;
  /** The data source reported an impossible liquidity figure (spoofed pool) — the number was discarded. */
  fakeLiquidity?: boolean;
};

/** No single pool on this chain holds billions; such numbers come from spoofed pools and must not look "safe". */
const MAX_SANE_LIQUIDITY = 2e9;
function saneLiquidity(v: number): { liquidity: number; fakeLiquidity?: boolean } {
  return Number.isFinite(v) && v <= MAX_SANE_LIQUIDITY ? { liquidity: v } : { liquidity: 0, fakeLiquidity: true };
}

const STABLES = new Set(["USDG", "USDC", "USDT", "USDE", "DAI", "PYUSD", "USD1"]);
const unescape = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, String.fromCharCode(34)).replace(/&#39;|&apos;/g, String.fromCharCode(39)).replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const num = (v: string | null | undefined) => (v == null || v === "" ? 0 : +v);

function parsePools(list: GTList): Token[] {
  const inc = new Map((list.included ?? []).map((x) => [x.id, x]));
  return list.data.map((p) => {
    const a = p.attributes;
    const base = inc.get(p.relationships.base_token.data.id);
    const quote = inc.get(p.relationships.quote_token.data.id);
    const dex = inc.get(p.relationships.dex.data.id);
    const [baseSym, quoteSym] = a.name.split(" / ").map((s) => s.split(" ")[0]);
    const t24 = a.transactions.h24 ?? { buys: 0, sells: 0 };
    const t1 = a.transactions.h1 ?? { buys: 0, sells: 0 };
    return {
      pool: a.address,
      poolName: a.name,
      dex: dex?.attributes.name ?? p.relationships.dex.data.id,
      address: base?.attributes.address ?? p.relationships.base_token.data.id.replace(`${NET}_`, ""),
      symbol: unescape(base?.attributes.symbol ?? baseSym),
      name: unescape(base?.attributes.name ?? baseSym),
      image: base?.attributes.image_url && !base.attributes.image_url.includes("missing") ? base.attributes.image_url : null,
      quote: quote?.attributes.symbol ?? quoteSym ?? "",
      price: num(a.base_token_price_usd),
      change: { m5: num(a.price_change_percentage.m5), h1: num(a.price_change_percentage.h1), h6: num(a.price_change_percentage.h6), h24: num(a.price_change_percentage.h24) },
      volume: { h1: num(a.volume_usd.h1), h6: num(a.volume_usd.h6), h24: num(a.volume_usd.h24) },
      txns: {
        h1: { buys: t1.buys, sells: t1.sells },
        h24: { buys: t24.buys, sells: t24.sells, buyers: t24.buyers ?? 0, sellers: t24.sellers ?? 0 },
      },
      ...saneLiquidity(num(a.reserve_in_usd)),
      fdv: a.fdv_usd ? +a.fdv_usd : null,
      mcap: a.market_cap_usd ? +a.market_cap_usd : null,
      createdAt: a.pool_created_at,
      ageHours: a.pool_created_at ? (Date.now() - Date.parse(a.pool_created_at)) / 3_600_000 : null,
    };
  });
}

/** One entry per token: pick its deepest pool, sum volume across its pools. Stablecoins skipped as base. */
function dedupe(pools: Token[]): Token[] {
  const by = new Map<string, { best: Token; vol: number }>();
  for (const p of pools) {
    if (STABLES.has(p.symbol.toUpperCase())) continue;
    // native ETH (0x000…0 in Uniswap v4) and WETH are the same asset
    const k = /^0x0{40}$/i.test(p.address) || p.symbol.toUpperCase() === "WETH" ? "eth" : p.address.toLowerCase();
    const cur = by.get(k);
    if (!cur) by.set(k, { best: p, vol: p.volume.h24 });
    else {
      cur.vol += p.volume.h24;
      if (p.liquidity > cur.best.liquidity) cur.best = p;
    }
  }
  return [...by.values()].map(({ best, vol }) => ({ ...best, volume: { ...best.volume, h24: Math.max(vol, best.volume.h24) } }));
}

/**
 * Same symbol, different contract = possible impersonation. The token whose pool has existed
 * longest is treated as the original; the rest get `copycatOf`. `reference` adds known tokens (e.g. the top list).
 */
function markCopycats(list: Token[], reference: Token[] = []): Token[] {
  const original = new Map<string, Token>();
  for (const t of [...reference, ...list]) {
    const s = t.symbol.toUpperCase();
    if (s === "WETH" || /^0x0{40}$/i.test(t.address)) continue;
    const cur = original.get(s);
    if (!cur || (t.ageHours ?? 0) > (cur.ageHours ?? 0)) original.set(s, t);
  }
  return list.map((t) => {
    const o = original.get(t.symbol.toUpperCase());
    if (!o || o.address.toLowerCase() === t.address.toLowerCase()) return t;
    // a days-old copy "holding" far more liquidity than the token it imitates is not believable
    const implausible = (t.ageHours ?? 0) < 24 * 7 && t.liquidity > 1_000_000 && t.liquidity > 5 * Math.max(o.liquidity, 1);
    return implausible ? { ...t, copycatOf: o.address, liquidity: 0, fakeLiquidity: true } : { ...t, copycatOf: o.address };
  });
}

/** Tokens whose numbers can be trusted in chain-wide totals and rankings (no copycats, no fake liquidity). */
export const trusted = (t: Token) => !t.copycatOf && !t.fakeLiquidity;

const INC = "include=base_token,quote_token,dex";

/* ───────────── DexScreener (generous limits) for live pair stats ───────────── */

type DSPair = {
  chainId: string; pairAddress: string; dexId: string; labels?: string[];
  baseToken: { address: string; name: string; symbol: string }; quoteToken: { symbol: string };
  priceUsd?: string; priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { h1?: number; h6?: number; h24?: number };
  txns?: { h1?: { buys: number; sells: number }; h24?: { buys: number; sells: number } };
  liquidity?: { usd?: number }; fdv?: number; marketCap?: number; pairCreatedAt?: number; info?: { imageUrl?: string };
};

function fromDS(p: DSPair): Token {
  return {
    pool: p.pairAddress, poolName: `${p.baseToken.symbol} / ${p.quoteToken.symbol}`,
    dex: `${p.dexId}${p.labels?.length ? ` ${p.labels.join("/")}` : ""}`,
    address: p.baseToken.address, symbol: unescape(p.baseToken.symbol), name: unescape(p.baseToken.name), image: p.info?.imageUrl ?? null, quote: p.quoteToken.symbol,
    price: +(p.priceUsd ?? 0),
    change: { m5: p.priceChange?.m5 ?? 0, h1: p.priceChange?.h1 ?? 0, h6: p.priceChange?.h6 ?? 0, h24: p.priceChange?.h24 ?? 0 },
    volume: { h1: p.volume?.h1 ?? 0, h6: p.volume?.h6 ?? 0, h24: p.volume?.h24 ?? 0 },
    txns: {
      h1: { buys: p.txns?.h1?.buys ?? 0, sells: p.txns?.h1?.sells ?? 0 },
      h24: { buys: p.txns?.h24?.buys ?? 0, sells: p.txns?.h24?.sells ?? 0, buyers: 0, sellers: 0 },
    },
    ...saneLiquidity(p.liquidity?.usd ?? 0), fdv: p.fdv ?? null, mcap: p.marketCap ?? null,
    createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
    ageHours: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null,
  };
}

/** Live stats for up to N pools, 30 per DexScreener call. */
async function dsPairs(pools: string[]): Promise<Map<string, Token>> {
  const out = new Map<string, Token>();
  for (let i = 0; i < pools.length; i += 30) {
    const chunk = pools.slice(i, i + 30);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${NET}/${chunk.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) continue;
    const d = (await res.json()) as { pairs?: DSPair[] | null };
    for (const p of d.pairs ?? []) out.set(p.pairAddress.toLowerCase(), fromDS(p));
  }
  return out;
}

/** Refresh price/changes/liquidity/txns of a GeckoTerminal list with DexScreener (keeps GT's image, buyers and summed volume). */
async function freshen(list: Token[], key: string): Promise<Token[]> {
  const live = await cached(`ds:${key}`, 30_000, () => dsPairs(list.map((t) => t.pool))).catch(() => new Map<string, Token>());
  return list.map((t) => {
    const l = live.get(t.pool.toLowerCase());
    if (!l || !l.price) return t;
    return {
      ...t, price: l.price, change: l.change, liquidity: l.fakeLiquidity || t.fakeLiquidity ? 0 : l.liquidity || t.liquidity, fakeLiquidity: t.fakeLiquidity || l.fakeLiquidity, fdv: l.fdv ?? t.fdv, mcap: l.mcap ?? t.mcap,
      volume: { h1: l.volume.h1, h6: l.volume.h6, h24: Math.max(t.volume.h24, l.volume.h24) },
      txns: { h1: l.txns.h1, h24: { ...t.txns.h24, buys: l.txns.h24.buys, sells: l.txns.h24.sells } },
      image: t.image ?? l.image,
    };
  });
}

/* ───────────── lists (GeckoTerminal, long-cached) ───────────── */

const topPage = (page: number, prio: "high" | "low") =>
  gt<GTList>(`/networks/${NET}/pools?page=${page}&sort=h24_volume_usd_desc&${INC}`, prio).then(parsePools);
const shapeTop = (pools: Token[]) => markCopycats(dedupe(pools)).sort((a, b) => b.volume.h24 - a.volume.h24);

async function topRaw() {
  // Cold start: answer from page 1 right away (high priority), fill page 2 in the background.
  if (!peek<Token[]>("rh:top")) {
    const first = await cached("rh:top:p1", 300_000, () => topPage(1, "high"));
    if (!peek<Token[]>("rh:top")) {
      put("rh:top", shapeTop(first), 0); // stored as stale → next read triggers the full refresh
      swr("rh:top", 300_000, async () => shapeTop([...first, ...(await topPage(2, "low"))])).catch(() => {});
    }
  }
  return swr("rh:top", 300_000, async () => shapeTop([...(await topPage(1, "low")), ...(await topPage(2, "low"))]));
}
export async function getTopTokens(): Promise<Token[]> {
  return freshen(await topRaw(), "top");
}

// Cold cache = someone is waiting on screen → fast lane; warm cache = background refresh → slow lane.
const lane = (key: string): "high" | "low" => (peek(key) ? "low" : "high");

const trendingFetch = async () =>
  markCopycats(dedupe(parsePools(await gt<GTList>(`/networks/${NET}/trending_pools?${INC}`, lane("rh:trending")))), peek<Token[]>("rh:top") ?? []);

/** `wait: false` never blocks: returns [] on a cold cache and warms it in the background. */
export async function getTrending(opts: { wait?: boolean } = {}): Promise<Token[]> {
  if (opts.wait === false && !peek<Token[]>("rh:trending")) {
    swr("rh:trending", 300_000, trendingFetch).catch(() => {});
    return [];
  }
  return freshen(await swr("rh:trending", 300_000, trendingFetch), "trending");
}

export async function getNewPools(): Promise<Token[]> {
  const raw = await swr("rh:new", 180_000, async () =>
    markCopycats(
      parsePools(await gt<GTList>(`/networks/${NET}/new_pools?${INC}`, lane("rh:new"))).filter((t) => !STABLES.has(t.symbol.toUpperCase())),
      peek<Token[]>("rh:top") ?? []
    )
  );
  return freshen(raw, "new");
}

/** Single pool: DexScreener first (fast, generous), GeckoTerminal as fallback. Enriched with GT list data when we have it. */
export async function getPool(address: string): Promise<Token> {
  const ref = [...(peek<Token[]>("rh:top") ?? []), ...(peek<Token[]>("rh:trending") ?? [])];
  return markCopycats([await getPoolRaw(address)], ref)[0];
}

async function getPoolRaw(address: string): Promise<Token> {
  return cached(`rh:pool:${address.toLowerCase()}`, 20_000, async () => {
    const known = (peek<Token[]>("rh:top") ?? []).find((t) => t.pool.toLowerCase() === address.toLowerCase());
    const ds = (await dsPairs([address]).catch(() => new Map<string, Token>())).get(address.toLowerCase());
    if (ds) {
      if (!known) return ds;
      return { ...ds, image: known.image ?? ds.image, dex: known.dex, txns: { h1: ds.txns.h1, h24: { ...known.txns.h24, buys: ds.txns.h24.buys, sells: ds.txns.h24.sells } } };
    }
    if (known) return known;
    const d = await gt<{ data: GTPool; included?: GTIncluded[] }>(`/networks/${NET}/pools/${address}?${INC}`, "high");
    return parsePools({ data: [d.data], included: d.included })[0];
  });
}

/* ───────────── search / resolve ───────────── */

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/.test(s.trim());

async function dexScreenerSearch(q: string): Promise<{ pool: string; symbol: string; name: string; liquidity: number }[]> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const d = (await res.json()) as { pairs?: { chainId: string; pairAddress: string; baseToken: { symbol: string; name: string }; liquidity?: { usd?: number } }[] };
  return (d.pairs ?? [])
    .filter((p) => p.chainId === NET)
    .map((p) => ({ pool: p.pairAddress, symbol: p.baseToken.symbol, name: p.baseToken.name, liquidity: p.liquidity?.usd ?? 0 }));
}

export type SearchHit = { pool: string; symbol: string; name: string; liquidity: number; image?: string | null; price?: number };

export async function searchTokens(q: string): Promise<SearchHit[]> {
  const query = q.trim().replace(/^\$/, "");
  if (!query) return [];
  return cached(`rh:search:${query.toLowerCase()}`, 300_000, async () => {
    // 1) our cached list (no extra API call when warm)
    const top = peek<Token[]>("rh:top") ?? [];
    const ql = query.toLowerCase();
    const local = top
      .filter((t) => t.symbol.toLowerCase() === ql || t.name.toLowerCase().includes(ql) || t.address.toLowerCase() === ql || t.pool.toLowerCase() === ql)
      .map((t) => ({ pool: t.pool, symbol: t.symbol, name: t.name, liquidity: t.liquidity, image: t.image, price: t.price }));
    if (local.length) {
      const orig = new Set(top.filter((t) => !t.copycatOf).map((t) => t.pool));
      return local.sort((a, b) => Number(orig.has(b.pool)) - Number(orig.has(a.pool)) || b.liquidity - a.liquidity);
    }
    // 2) DexScreener (generous limits)
    const ds = await dexScreenerSearch(query).catch(() => []);
    if (ds.length) return ds.sort((a, b) => b.liquidity - a.liquidity).slice(0, 10);
    // 3) GeckoTerminal search
    const d = await gt<GTList>(`/search/pools?query=${encodeURIComponent(query)}&network=${NET}&${INC}`, "high");
    return dedupe(parsePools(d)).map((t) => ({ pool: t.pool, symbol: t.symbol, name: t.name, liquidity: t.liquidity, image: t.image, price: t.price }));
  });
}

/** Turn "NVDA", "$CASHCAT", a token address or a pool address into the best pool address. */
const WETH_ADDRESS = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";

/** Deepest Robinhood Chain pool for a token contract (DexScreener, no GeckoTerminal quota). */
async function bestPoolForToken(token: string): Promise<string | null> {
  return cached(`ds:tokpool:${token.toLowerCase()}`, 600_000, async () => {
    const res = await fetch(`https://api.dexscreener.com/token-pairs/v1/${NET}/${token}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const pairs = (await res.json()) as { pairAddress: string; baseToken: { address: string }; liquidity?: { usd?: number } }[];
    const asBase = pairs.filter((p) => p.baseToken.address.toLowerCase() === token.toLowerCase());
    const best = (asBase.length ? asBase : pairs).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return best?.pairAddress ?? null;
  });
}

export async function resolvePool(input: string): Promise<string> {
  const s = input.trim();
  const top = peek<Token[]>("rh:top") ?? [];
  if (isAddr(s)) {
    if (s.length === 66) return s; // v4 pool id
    // could be a pool or a token address
    const asToken = top.find((t) => t.address.toLowerCase() === s.toLowerCase());
    if (asToken) return asToken.pool;
    if (top.some((t) => t.pool.toLowerCase() === s.toLowerCase())) return s;
    return (await bestPoolForToken(s).catch(() => null)) ?? s;
  }
  const sym = s.replace(/^\$/, "").toUpperCase();
  if (sym === "WETH" || sym === "ETH") {
    const known = top.find((t) => t.symbol.toUpperCase() === "WETH");
    if (known) return known.pool;
    const p = await bestPoolForToken(WETH_ADDRESS).catch(() => null);
    if (p) return p;
  }
  const hits = await searchTokens(s);
  const exact = hits.find((h) => h.symbol.toLowerCase() === s.replace(/^\$/, "").toLowerCase());
  const pick = exact ?? hits[0];
  if (!pick) throw new Error(`No Robinhood Chain token found for “${input}”`);
  return pick.pool;
}

/* ───────────── OHLCV ───────────── */

export async function getCandles(pool: string, interval: Interval = "1h", prio: "high" | "low" = "high"): Promise<Candle[]> {
  const map: Record<Interval, [string, number]> = {
    "15m": ["minute", 15], "1h": ["hour", 1], "4h": ["hour", 4], "1d": ["day", 1], "1w": ["day", 1],
  };
  const [tf, agg] = map[interval];
  return swr(`rh:ohlcv:${pool.toLowerCase()}:${interval}`, interval === "15m" ? 90_000 : 180_000, async () => {
    const d = await gt<{ data: { attributes: { ohlcv_list: number[][] } } }>(
      `/networks/${NET}/pools/${pool}/ohlcv/${tf}?aggregate=${agg}&limit=${interval === "1w" ? 1000 : 400}&currency=usd&token=base`,
      prio
    );
    // The feed occasionally returns null fields or repeated timestamps; charts and indicators need clean, unique, ascending bars.
    const ok = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
    const seen = new Set<number>();
    const candles = (d.data.attributes.ohlcv_list as (number | null)[][])
      .filter((r) => ok(r[0]) && ok(r[1]) && ok(r[2]) && ok(r[3]) && ok(r[4]))
      .map(([t, o, h, l, c, v]) => ({ time: t as number, open: o as number, high: h as number, low: l as number, close: c as number, volume: ok(v) ? v : 0 }))
      .sort((a, b) => a.time - b.time)
      .filter((k) => (seen.has(k.time) ? false : (seen.add(k.time), true)));
    return interval === "1w" ? weekly(candles) : candles;
  });
}

function weekly(c: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const x of c) {
    const wk = Math.floor(x.time / 604800) * 604800;
    const cur = out[out.length - 1];
    if (cur && cur.time === wk) {
      cur.high = Math.max(cur.high, x.high);
      cur.low = Math.min(cur.low, x.low);
      cur.close = x.close;
      cur.volume += x.volume;
    } else out.push({ ...x, time: wk });
  }
  return out;
}

/* ───────────── network status (RPC) ───────────── */

export async function getNetworkStatus() {
  return cached("rh:net", 8_000, async () => {
    const res = await postJson(
      CHAIN.rpc,
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
        { jsonrpc: "2.0", id: 3, method: "eth_gasPrice", params: [] },
      ]),
      8_000
    );
    if (res.status < 200 || res.status >= 300) throw new Error(`RPC ${res.status}`);
    const arr = (await res.json()) as { id: number; result: string }[];
    const get = (id: number) => arr.find((x) => x.id === id)?.result ?? "0x0";
    return {
      chainId: parseInt(get(1), 16),
      block: parseInt(get(2), 16),
      gasGwei: parseInt(get(3), 16) / 1e9,
      at: Date.now(),
    };
  });
}

/* ───────────── on-chain signals & risk ───────────── */

export const SIGNALS = {
  momentum: { label: "Momentum", tone: "bull", hint: "Up on 1h, 6h and 24h" },
  breakout: { label: "24h breakout", tone: "bull", hint: "Up more than 20% in 24h" },
  dip_buy: { label: "Dip in uptrend", tone: "bull", hint: "Up >5% on 24h but pulling back on 1h" },
  volume_spike: { label: "Volume spike", tone: "neutral", hint: "Last hour volume > 3× the 24h hourly average" },
  buy_pressure: { label: "Buy pressure", tone: "bull", hint: "24h buys > 1.5× sells" },
  sell_pressure: { label: "Sell pressure", tone: "bear", hint: "24h sells > 1.5× buys" },
  dumping: { label: "Dumping", tone: "bear", hint: "Down more than 20% in 24h" },
  new_pool: { label: "New pool", tone: "neutral", hint: "Pool created in the last 24h" },
  deep_liquidity: { label: "Deep liquidity", tone: "bull", hint: "More than $1M liquidity" },
} as const;
export type SignalKey = keyof typeof SIGNALS;

export const RISKS = {
  low_liquidity: { label: "Low liquidity", hint: "Under $50k — big slippage, easy to manipulate", w: 30 },
  very_new: { label: "Very new", hint: "Pool younger than 6 hours", w: 20 },
  fdv_vs_liq: { label: "FDV ≫ liquidity", hint: "FDV more than 50× pool liquidity", w: 15 },
  extreme_move: { label: "Extreme move", hint: "Moved more than 50% in 24h", w: 15 },
  few_traders: { label: "Few traders", hint: "Fewer than 25 unique buyers in 24h", w: 10 },
  sell_pressure: { label: "Heavy selling", hint: "24h sells > 1.5× buys", w: 10 },
  copycat: { label: "Possible copycat", hint: "An older token on Robinhood Chain uses the same symbol — check the contract address", w: 35 },
  wash_volume: { label: "Wash volume", hint: "24h volume is more than 50× liquidity — likely wash trading or a drained pool", w: 20 },
  fake_liquidity: { label: "Fake liquidity", hint: "The pool reports an impossible liquidity figure — a spoofed pool; real liquidity is unknown", w: 40 },
} as const;
export type RiskKey = keyof typeof RISKS;

export function signalsFor(t: Token): SignalKey[] {
  const s: SignalKey[] = [];
  const { change: c, volume: v, txns } = t;
  if (c.h1 > 0 && c.h6 > 0 && c.h24 > 0) s.push("momentum");
  if (c.h24 > 20) s.push("breakout");
  if (c.h24 > 5 && c.h1 < -2) s.push("dip_buy");
  if (v.h24 > 0 && v.h1 > (3 * v.h24) / 24 && v.h1 > 5_000) s.push("volume_spike");
  if (txns.h24.buys > 50 && txns.h24.buys > 1.5 * txns.h24.sells) s.push("buy_pressure");
  if (txns.h24.sells > 50 && txns.h24.sells > 1.5 * txns.h24.buys) s.push("sell_pressure");
  if (c.h24 < -20) s.push("dumping");
  if (t.ageHours != null && t.ageHours < 24) s.push("new_pool");
  if (t.liquidity > 1_000_000) s.push("deep_liquidity");
  return s;
}

export function risksFor(t: Token): { flags: RiskKey[]; score: number; level: "Low" | "Medium" | "High" } {
  const f: RiskKey[] = [];
  if (t.liquidity < 50_000) f.push("low_liquidity");
  if (t.ageHours != null && t.ageHours < 6) f.push("very_new");
  const isEth = t.symbol.toUpperCase() === "WETH" || /^0x0{40}$/i.test(t.address);
  if (!isEth && t.fdv && t.liquidity > 0 && t.fdv / t.liquidity > 50) f.push("fdv_vs_liq");
  if (Math.abs(t.change.h24) > 50) f.push("extreme_move");
  if (t.txns.h24.buyers > 0 && t.txns.h24.buyers < 25) f.push("few_traders");
  if (t.txns.h24.sells > 50 && t.txns.h24.sells > 1.5 * t.txns.h24.buys) f.push("sell_pressure");
  if (t.copycatOf) f.push("copycat");
  if (t.fakeLiquidity) f.push("fake_liquidity");
  if (t.liquidity > 0 && t.volume.h24 > 50 * t.liquidity && t.volume.h24 > 10_000) f.push("wash_volume");
  const score = Math.min(100, f.reduce((s, k) => s + RISKS[k].w, 0));
  return { flags: f, score, level: score >= 45 ? "High" : score >= 20 ? "Medium" : "Low" };
}

export const links = (t: { pool: string; address: string }) => ({
  explorer: `${CHAIN.explorer}/token/${t.address}`,
  geckoterminal: `https://www.geckoterminal.com/robinhood/pools/${t.pool}`,
  dexscreener: `https://dexscreener.com/robinhood/${t.pool}`,
});

/** Latest USD price per pool (DexScreener batch) — used by price alerts. */
export async function getPrices(pools: string[]): Promise<Record<string, number | null>> {
  const key = pools.map((p) => p.toLowerCase()).sort().join(",");
  const live = await cached(`ds:prices:${key}`, 15_000, () => dsPairs(pools));
  return Object.fromEntries(pools.map((p) => [p.toLowerCase(), live.get(p.toLowerCase())?.price ?? null]));
}

/** Called once at server start: fill the caches so the first visitor doesn't wait on the rate-limited feed. */
export async function warmUp() {
  try {
    await getNetworkStatus().catch(() => {});
    const top = await getTopTokens();
    // default terminal view first (the page opens on WETH 1h)
    const weth = top.find((t) => t.symbol.toUpperCase() === "WETH");
    if (weth) await getCandles(weth.pool, "1h", "high").catch(() => {});
    // Nothing else: on the keyless plan every call counts, so the rest of the quota is kept for what users click.
    getTrending({ wait: false }).catch(() => {});
    // stock-token list (DexScreener + a few low-priority searches) so the Stocks page opens instantly
    import("./stocks").then((m) => m.getStockPremiums()).catch(() => {});
  } catch {}
}
