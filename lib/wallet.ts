import { cached, peek } from "./cache";
import { BLOCK_MS, BOT_TX_COUNT, TRANSFER_TOPIC, addrWord, isAddress, multicall, rpc, rpcBatch, sel, toBig, txCounts, units } from "./evm";
import { getTopTokens, risksFor, type Token } from "./rhchain";
import { getStockTokens } from "./stocks";

/* ───────────── token universe we can value ───────────── */

type Known = { address: string; symbol: string; name: string; image: string | null; price: number; token: Token | null; pool: string | null; liquidity: number };

/** Every token Strix already knows a price for (top, trending, new, stock tokens). */
async function knownTokens(): Promise<Map<string, Known>> {
  const map = new Map<string, Known>();
  const add = (t: Token) => {
    const k = t.address.toLowerCase();
    const cur = map.get(k);
    if (!cur || t.liquidity > cur.liquidity)
      map.set(k, { address: t.address, symbol: t.symbol, name: t.name, image: t.image, price: t.price, token: t, pool: t.pool, liquidity: t.liquidity });
  };
  (await getTopTokens().catch(() => [] as Token[])).forEach(add);
  (peek<Token[]>("rh:trending") ?? []).forEach(add);
  (peek<Token[]>("rh:new") ?? []).forEach(add);
  (await getStockTokens().catch(() => [])).forEach((s) => add(s.token));
  return map;
}

type DSPair = {
  chainId: string; pairAddress: string; baseToken: { address: string; symbol: string; name: string }; quoteToken: { symbol: string; address?: string; name?: string };
  priceUsd?: string; priceNative?: string; liquidity?: { usd?: number }; priceChange?: { h24?: number }; volume?: { h24?: number };
  txns?: { h24?: { buys: number; sells: number } }; fdv?: number; pairCreatedAt?: number; info?: { imageUrl?: string }; dexId: string;
};

/** Price unknown tokens via DexScreener (30 token addresses per call). */
async function priceUnknown(addresses: string[]): Promise<Map<string, Known>> {
  const out = new Map<string, Known>();
  for (let i = 0; i < addresses.length; i += 30) {
    const chunk = addresses.slice(i, i + 30);
    const key = `ds:tok:${chunk.map((a) => a.toLowerCase()).sort().join(",")}`;
    const pairs = await cached(key, 120_000, async () => {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/robinhood/${chunk.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      return res.ok ? ((await res.json()) as DSPair[]) : [];
    }).catch(() => [] as DSPair[]);
    for (const p of pairs) {
      if (p.chainId !== "robinhood") continue;
      // the token we asked about may be the QUOTE side (e.g. USDG in CASHCAT/USDG): price = base USD price / base-in-quote price
      const asQuote = p.quoteToken.address && chunk.some((a) => a.toLowerCase() === p.quoteToken.address!.toLowerCase()) && !chunk.some((a) => a.toLowerCase() === p.baseToken.address.toLowerCase());
      if (asQuote) {
        const qk = p.quoteToken.address!.toLowerCase();
        const native = +(p.priceNative ?? 0);
        const qPrice = native > 0 ? +(p.priceUsd ?? 0) / native : 0;
        const liq = p.liquidity?.usd ?? 0;
        if (qPrice > 0 && (!out.has(qk) || out.get(qk)!.liquidity < liq))
          out.set(qk, { address: p.quoteToken.address!, symbol: p.quoteToken.symbol, name: p.quoteToken.name ?? p.quoteToken.symbol, image: null, price: qPrice, token: null, pool: null, liquidity: liq });
        continue;
      }
      const k = p.baseToken.address.toLowerCase();
      const liq = p.liquidity?.usd ?? 0;
      if (out.has(k) && out.get(k)!.liquidity >= liq) continue;
      const token: Token = {
        pool: p.pairAddress, poolName: `${p.baseToken.symbol} / ${p.quoteToken.symbol}`, dex: p.dexId, address: p.baseToken.address,
        symbol: p.baseToken.symbol, name: p.baseToken.name, image: p.info?.imageUrl ?? null, quote: p.quoteToken.symbol,
        price: +(p.priceUsd ?? 0), change: { m5: 0, h1: 0, h6: 0, h24: p.priceChange?.h24 ?? 0 }, volume: { h1: 0, h6: 0, h24: p.volume?.h24 ?? 0 },
        txns: { h1: { buys: 0, sells: 0 }, h24: { buys: p.txns?.h24?.buys ?? 0, sells: p.txns?.h24?.sells ?? 0, buyers: 0, sellers: 0 } },
        liquidity: liq, fdv: p.fdv ?? null, mcap: null, createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
        ageHours: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null,
      };
      out.set(k, { address: token.address, symbol: token.symbol, name: token.name, image: token.image, price: token.price, token, pool: token.pool, liquidity: liq });
    }
  }
  return out;
}

async function decimalsOf(tokens: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const missing: string[] = [];
  for (const t of tokens) {
    const d = peek<number>(`dec:${t.toLowerCase()}`);
    if (d != null) out.set(t.toLowerCase(), d);
    else missing.push(t);
  }
  if (missing.length) {
    const r = await multicall(missing.map((t) => ({ target: t, data: sel.decimals })));
    missing.forEach((t, i) => {
      const d = r[i] ? Number(toBig(r[i])) : 18;
      const dec = d > 0 && d <= 36 ? d : 18;
      out.set(t.toLowerCase(), dec);
      cached(`dec:${t.toLowerCase()}`, 86_400_000 * 30, async () => dec);
    });
  }
  return out;
}

/* ───────────── activity (smart money) ───────────── */

export type Flow = { token: string; symbol: string; amount: number; usd: number | null };
export type Trade = { tx: string; block: number; time: string; kind: "swap" | "buy" | "sent" | "received" | "airdrop"; sent: Flow[]; received: Flow[]; ethIn: number };

async function transferLogs(wallet: string, hours: number) {
  const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
  const span = 30_000; // RPC limit per getLogs
  const ranges = Math.min(Math.ceil((hours * 3_600_000) / BLOCK_MS / span), 48);
  const w = "0x" + addrWord(wallet);
  const calls: { method: string; params: unknown[] }[] = [];
  for (let i = 0; i < ranges; i++) {
    const to = head - i * span;
    const from = to - span + 1;
    const range = { fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16) };
    calls.push({ method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER_TOPIC, w] }] }); // sent
    calls.push({ method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER_TOPIC, null, w] }] }); // received
  }
  const res = await rpcBatch<{ address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string }[]>(calls, 12);
  const complete = res.every((r) => r !== null);
  const logs = res.flatMap((r) => r ?? []);
  return { head, logs, complete, coveredHours: complete ? hours : Math.round((res.findIndex((r) => r === null) / 2) * span * BLOCK_MS / 3_600_000 * 10) / 10 };
}

/* ───────────── public API ───────────── */

export type Holding = {
  address: string; symbol: string; name: string; image: string | null; balance: number; price: number | null; value: number | null;
  change24h: number | null; liquidity: number | null; pool: string | null; risk: ReturnType<typeof risksFor> | null;
  /** Unsolicited lookalike / dust token (e.g. a fake "USDG" airdropped to the wallet). */
  spam: boolean; spamReason?: string;
};

export async function scanWallet(address: string, hours = 24) {
  if (!isAddress(address)) throw new Error("Enter a valid 0x… wallet address");
  const wallet = address.toLowerCase();
  return cached(`wallet:${wallet}:${hours}`, 60_000, async () => {
    const [known, activity, ethWei, nonces] = await Promise.all([
      knownTokens(),
      transferLogs(wallet, hours).catch(() => ({ head: 0, logs: [] as never[], complete: false, coveredHours: 0 })),
      rpc<string>("eth_getBalance", [wallet, "latest"]).catch(() => "0x0"),
      txCounts([wallet]).catch(() => new Map<string, number>()),
    ]);
    const txCount = nonces.get(wallet) ?? null;

    // tokens to check = known universe + anything this wallet touched recently
    const touched = [...new Set(activity.logs.map((l) => l.address.toLowerCase()))];
    const unknownTouched = touched.filter((a) => !known.has(a));
    // symbols of tokens Strix trusts (top/trending/new/official stocks) — a different contract using one of these is a lookalike
    const officialBySymbol = new Map<string, string>();
    for (const k of known.values()) if (!k.token?.copycatOf) officialBySymbol.set(k.symbol.toUpperCase(), k.address.toLowerCase());
    const extra = await priceUnknown(unknownTouched);
    for (const [k, v] of extra) known.set(k, v);
    const candidates = [...new Set([...known.keys(), ...touched])];

    const decs = await decimalsOf(candidates);
    const balRaw = await multicall(candidates.map((t) => ({ target: t, data: sel.balanceOf + addrWord(wallet) })));

    const holdings: Holding[] = [];
    candidates.forEach((t, i) => {
      const bal = units(toBig(balRaw[i]), decs.get(t) ?? 18);
      if (bal <= 0) return;
      const k = known.get(t);
      const value = k ? bal * k.price : null;
      if (value != null && value < 0.01) return; // dust
      const sym = (k?.symbol ?? "?").toUpperCase();
      const official = officialBySymbol.get(sym);
      const lookalike = !!official && official !== t;
      holdings.push({
        address: k?.address ?? t, symbol: k?.symbol ?? "?", name: k?.name ?? "Unknown token", image: k?.image ?? null, balance: bal,
        price: k?.price ?? null, value, change24h: k?.token?.change.h24 ?? null, liquidity: k?.liquidity ?? null, pool: k?.pool ?? null,
        risk: k?.token ? risksFor(k.token) : null,
        spam: lookalike || !k,
        spamReason: lookalike ? `Lookalike of the real ${sym}` : !k ? "Unpriced token with no DEX market" : undefined,
      });
    });

    // native ETH, valued with the WETH price
    const eth = units(toBig(ethWei), 18);
    const wethPrice = [...known.values()].find((k) => k.symbol.toUpperCase() === "WETH")?.price ?? null;
    if (eth > 0) holdings.push({ address: "native", symbol: "ETH", name: "Ether (native)", image: null, balance: eth, price: wethPrice, value: wethPrice ? eth * wethPrice : null, change24h: null, liquidity: null, pool: null, risk: null, spam: false });

    // group transfers per transaction → swaps / received / sent
    const byTx = new Map<string, { block: number; sent: Map<string, bigint>; received: Map<string, bigint> }>();
    for (const l of activity.logs) {
      const from = "0x" + l.topics[1]?.slice(26);
      const to = "0x" + l.topics[2]?.slice(26);
      const amt = toBig(l.data);
      const e = byTx.get(l.transactionHash) ?? { block: parseInt(l.blockNumber, 16), sent: new Map(), received: new Map() };
      const tok = l.address.toLowerCase();
      if (from === wallet) e.sent.set(tok, (e.sent.get(tok) ?? 0n) + amt);
      if (to === wallet) e.received.set(tok, (e.received.get(tok) ?? 0n) + amt);
      byTx.set(l.transactionHash, e);
    }
    const flows = (m: Map<string, bigint>): Flow[] =>
      [...m.entries()].map(([tok, raw]) => {
        const k = known.get(tok);
        const amount = units(raw, decs.get(tok) ?? 18);
        return { token: tok, symbol: k?.symbol ?? "?", amount, usd: k ? amount * k.price : null };
      });
    const now = Date.now();
    // who sent each transaction, and how much ETH it paid: tells a real buy (wallet paid ETH) from an airdrop (someone else's tx)
    const txList = [...byTx.keys()].sort((a, b) => byTx.get(b)!.block - byTx.get(a)!.block).slice(0, 80);
    const txInfo = await rpcBatch<{ from: string; value: string }>(txList.map((h) => ({ method: "eth_getTransactionByHash", params: [h] })), 12).catch(() => [] as ({ from: string; value: string } | null)[]);
    const info = new Map(txList.map((h, i) => [h, txInfo[i] ?? null]));

    const trades: Trade[] = [...byTx.entries()]
      .map(([tx, e]) => {
        const sent = flows(e.sent), received = flows(e.received);
        const ti = info.get(tx);
        const byWallet = ti ? ti.from.toLowerCase() === wallet : true;
        const ethIn = ti ? units(toBig(ti.value), 18) : 0;
        const kind: Trade["kind"] =
          sent.length && received.length ? "swap"
          : received.length && byWallet && ethIn > 0 ? "buy"
          : received.length && !byWallet ? "airdrop"
          : received.length ? "received"
          : "sent";
        return { tx, block: e.block, time: new Date(now - (activity.head - e.block) * BLOCK_MS).toISOString(), kind, sent, received, ethIn };
      })
      .sort((a, b) => b.block - a.block);

    // tokens that only ever arrived through someone else's transaction and are worth < $1 → unsolicited spam
    const airdropOnly = new Set<string>();
    const boughtOrSold = new Set<string>();
    for (const t of trades) {
      for (const f of [...t.received, ...t.sent]) (t.kind === "airdrop" ? airdropOnly : boughtOrSold).add(f.token);
    }
    for (const h of holdings) {
      const a = h.address.toLowerCase();
      if (!h.spam && airdropOnly.has(a) && !boughtOrSold.has(a) && (h.value ?? 0) < 1 && !officialBySymbol.has(h.symbol.toUpperCase())) {
        h.spam = true;
        h.spamReason = "Unsolicited airdrop worth under $1";
      }
    }
    holdings.sort((a, b) => Number(a.spam) - Number(b.spam) || (b.value ?? -1) - (a.value ?? -1));
    const real = holdings.filter((h) => !h.spam);
    const total = real.reduce((s, h) => s + (h.value ?? 0), 0);
    const atRisk = real.filter((h) => h.risk?.level === "High").reduce((s, h) => s + (h.value ?? 0), 0);

    // net flow per token over the window (what this wallet is accumulating / dumping)
    const net = new Map<string, { symbol: string; inUsd: number; outUsd: number; trades: number }>();
    const spamTokens = new Set(holdings.filter((h) => h.spam).map((h) => h.address.toLowerCase()));
    for (const t of trades) {
      if (t.kind === "airdrop") continue; // unsolicited transfers say nothing about this wallet's strategy
      for (const f of t.received) {
        if (spamTokens.has(f.token)) continue;
        const n = net.get(f.token) ?? { symbol: f.symbol, inUsd: 0, outUsd: 0, trades: 0 };
        n.inUsd += f.usd ?? 0; n.trades++; net.set(f.token, n);
      }
      for (const f of t.sent) {
        if (spamTokens.has(f.token)) continue;
        const n = net.get(f.token) ?? { symbol: f.symbol, inUsd: 0, outUsd: 0, trades: 0 };
        n.outUsd += f.usd ?? 0; n.trades++; net.set(f.token, n);
      }
      if (t.kind === "buy" && t.ethIn > 0 && wethPrice) {
        const n = net.get("native") ?? { symbol: "ETH", inUsd: 0, outUsd: 0, trades: 0 };
        n.outUsd += t.ethIn * wethPrice; n.trades++; net.set("native", n);
      }
    }
    const netFlows = [...net.entries()]
      .map(([token, v]) => ({ token, ...v, netUsd: v.inUsd - v.outUsd }))
      .filter((v) => v.inUsd + v.outUsd >= 1)
      .sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd));

    return {
      address: wallet,
      txCount,
      isBot: txCount != null && txCount > BOT_TX_COUNT,
      totalValue: total,
      highRiskValue: atRisk,
      holdings,
      activity: {
        hours, coveredHours: activity.coveredHours, complete: activity.complete,
        trades: trades.filter((t) => t.kind !== "airdrop").slice(0, 60),
        airdrops: trades.filter((t) => t.kind === "airdrop").length,
        netFlows: netFlows.slice(0, 15),
        swaps: trades.filter((t) => t.kind === "swap" || t.kind === "buy").length,
      },
      spamCount: holdings.filter((h) => h.spam).length,
      checkedTokens: candidates.length,
      scannedAt: Date.now(),
    };
  });
}
