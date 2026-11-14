import { cached } from "./cache";
import { BLOCK_MS, TRANSFER_TOPIC, multicall, rpc, rpcBatch, sel, toBig, units } from "./evm";
import { getPool, resolvePool } from "./rhchain";

/**
 * Holder bubble map, built only from free on-chain reads (Transfer logs + balanceOf + getCode):
 *  1. read the token's Transfer logs backwards from the newest block — from launch when the token is
 *     small enough, otherwise as far back as the log budget allows (the coverage is reported);
 *  2. every address that received tokens is a candidate; current balances come from one multicall;
 *  3. the top holders are linked when the logs show a real relationship between them:
 *       - "transfer":    one holder sent tokens directly to another,
 *       - "same_source": both received tokens from the same wallet (a distributor that is not a pool),
 *       - "same_tx":     both received tokens out of the same transaction (a bundled buy);
 *  4. linked wallets are merged into clusters; contracts (pools, routers, lockers) are never clustered.
 */

type Log = { topics: string[]; data: string; blockNumber: string; transactionHash: string };
export type BubbleNode = { address: string; pct: number; balance: number; kind: "wallet" | "contract" | "pool" | "burn"; label?: string; cluster: number | null };
export type BubbleLink = { a: string; b: string; kind: "transfer" | "same_source" | "same_tx" | "same_block" };
export type BubbleCluster = { id: number; wallets: string[]; pct: number; reasons: BubbleLink["kind"][] };
export type BubbleMap = {
  token: { symbol: string; name: string; address: string; pool: string; image: string | null };
  supply: number;
  /** complete = every transfer since launch; otherwise the last `hours` in full plus `samples` older windows. */
  coverage: { complete: boolean; hours: number; samples: number; transfers: number };
  nodes: BubbleNode[];
  links: BubbleLink[];
  clusters: BubbleCluster[];
  summary: { walletsPct: number; clusteredPct: number; topClusterPct: number; topWalletPct: number; contractsPct: number; burnedPct: number };
  at: number;
};

const TOP = 60;
const MAX_CALLS = 10;
const MAX_LOGS = 90_000;
const ZERO = "0x" + "0".repeat(40);
const BURN = new Set([ZERO, "0x000000000000000000000000000000000000dead"]);
/** Uniswap v4 PoolManager on chain 4663 (verified: protocolFeeController() + extsload()). Holds every v4 pool's tokens. */
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const addr = (topic: string) => ("0x" + topic.slice(26)).toLowerCase();

/** Newest-first log scan with an adaptive block span (the RPC caps one query at 10,000 logs). */
async function scanLogs(token: string, head: number, startBlock: number) {
  const logs: Log[] = [];
  let to = head;
  let span = Math.max(2_000, head - startBlock + 1);
  let calls = 0;
  while (to >= startBlock && calls < MAX_CALLS && logs.length < MAX_LOGS) {
    const from = Math.max(startBlock, to - span + 1);
    calls++;
    try {
      const r = await rpc<Log[]>("eth_getLogs", [{ address: token, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [TRANSFER_TOPIC] }], 30_000);
      logs.push(...r);
      to = from - 1;
      // aim for ~6-8k logs per query
      if (r.length < 3_000) span = Math.min(span * 2, 50_000_000);
    } catch (e) {
      if (!/exceeds limit|too many|range/i.test((e as Error).message)) throw e;
      span = Math.max(500, Math.floor(span / 4));
    }
  }
  const complete = to < startBlock;
  // older history that didn't fit: sample windows spread back to launch (the launch window first —
  // that's where the initial distribution happens). Balances are read live, so any past receiver counts.
  let samples = 0;
  if (!complete && startBlock > 0) {
    const gap = to - startBlock;
    const points = [startBlock, ...Array.from({ length: 9 }, (_, i) => startBlock + Math.round((gap * (i + 1)) / 10))];
    const found = await Promise.all(points.map(async (p) => {
      for (let s = 40_000; s >= 500; s = Math.floor(s / 5)) {
        try {
          return await rpc<Log[]>("eth_getLogs", [{ address: token, fromBlock: "0x" + p.toString(16), toBlock: "0x" + Math.min(to, p + s).toString(16), topics: [TRANSFER_TOPIC] }], 30_000);
        } catch (e) {
          if (!/exceeds limit|too many|range/i.test((e as Error).message)) return [];
        }
      }
      return [];
    }));
    for (const r of found) if (r.length) { samples++; logs.push(...r); }
    // every mint ever (rare, so the whole chain fits one query): who received the supply first
    const mints = await rpc<Log[]>("eth_getLogs", [{ address: token, fromBlock: "0x0", toBlock: "0x" + to.toString(16), topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64)] }], 30_000).catch(() => [] as Log[]);
    logs.push(...mints);
  }
  return { logs, complete, oldest: Math.min(to + 1, head), samples };
}

export async function getBubbleMap(input: string): Promise<BubbleMap> {
  const pool = await resolvePool(input);
  return cached(`bubbles6:${pool.toLowerCase()}`, 20 * 60_000, async () => {
    const t = await getPool(pool);
    const token = t.address.toLowerCase();
    const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
    const created = t.createdAt ? Date.parse(t.createdAt) : NaN;
    // the token may be minted a little before its pool opened
    const startBlock = Number.isFinite(created) ? Math.max(0, head - Math.round((Date.now() - created) / BLOCK_MS) - 20_000) : 0;
    const { logs, complete, oldest, samples } = await scanLogs(token, head, startBlock);

    const meta = await multicall([{ target: token, data: sel.decimals }, { target: token, data: "0x18160ddd" }]);
    const decimals = Number(toBig(meta[0])) || 18;
    const supply = units(toBig(meta[1]), decimals);
    if (!(supply > 0)) throw new Error("Couldn't read this token's supply");

    // candidates: biggest receivers in the scanned window (+ the pool itself)
    const got = new Map<string, number>();
    for (const l of logs) {
      if (l.topics.length < 3) continue;
      const v = Number(toBig(l.data) / 10n ** BigInt(Math.max(0, decimals - 6)));
      // receivers rank by what they got; senders (sellers, distributors) are candidates too
      for (const a of [addr(l.topics[2]), addr(l.topics[1])]) got.set(a, (got.get(a) ?? 0) + v);
    }
    got.delete(ZERO);
    if (t.pool.length === 42) got.set(t.pool.toLowerCase(), Infinity);
    const cands = [...got.entries()].sort((a, b) => b[1] - a[1]).slice(0, 450).map(([a]) => a);
    const bals = await multicall(cands.map((a) => ({ target: token, data: sel.balanceOf + a.slice(2).padStart(64, "0") })));
    const ranked = cands
      .map((a, i) => ({ address: a, balance: units(toBig(bals[i]), decimals) }))
      .filter((x) => x.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, TOP);

    // contracts vs wallets (EIP-7702 delegated wallets have code 0xef0100… and count as wallets)
    const codes = await rpcBatch<string>(ranked.map((x) => ({ method: "eth_getCode", params: [x.address, "latest"] })), 20);
    // a failed batch entry gets one more try on its own; still unknown = not treated as a wallet
    await Promise.all(codes.map(async (c, i) => { if (c == null) codes[i] = await rpc<string>("eth_getCode", [ranked[i].address, "latest"]).catch(() => null); }));
    const poolAddr = t.pool.length === 42 ? t.pool.toLowerCase() : null;
    const nodes: BubbleNode[] = ranked.map((x, i) => {
      const code = codes[i] ?? "unknown";
      const isContract = code !== "0x" && !code.startsWith("0xef0100");
      return {
        address: x.address, balance: x.balance, pct: (x.balance / supply) * 100, cluster: null,
        kind: BURN.has(x.address) ? "burn" : x.address === poolAddr || x.address === POOL_MANAGER ? "pool" : isContract ? "contract" : "wallet",
        label: BURN.has(x.address) ? "Burned" : x.address === POOL_MANAGER ? "Uniswap v4 pools" : x.address === poolAddr ? "Liquidity pool" : undefined,
      };
    });
    const wallets = new Set(nodes.filter((n) => n.kind === "wallet").map((n) => n.address));
    const contracts = new Set(nodes.filter((n) => n.kind !== "wallet").map((n) => n.address));

    // senders that are known contracts can't be distributors; unknown senders need a code check
    const senders = new Set<string>();
    for (const l of logs) if (l.topics.length >= 3) { const f = addr(l.topics[1]), to = addr(l.topics[2]); if (wallets.has(to) && f !== ZERO && !wallets.has(f) && !contracts.has(f)) senders.add(f); }
    const sendList = [...senders].slice(0, 400);
    const sendCodes = sendList.length ? await rpcBatch<string>(sendList.map((a) => ({ method: "eth_getCode", params: [a, "latest"] })), 20) : [];
    const eoaSender = new Set(sendList.filter((_, i) => { const c = sendCodes[i]; return c === "0x" || (c ?? "").startsWith("0xef0100"); }));

    const links = new Map<string, BubbleLink>();
    const link = (a: string, b: string, kind: BubbleLink["kind"]) => {
      if (a === b) return;
      const k = a < b ? a + b : b + a;
      if (!links.has(k)) links.set(k, { a, b, kind });
    };
    const bySource = new Map<string, Set<string>>();
    const byTx = new Map<string, Set<string>>();
    // launch bundles: 3+ top holders buying in the same block during the first minute of trading
    const firstTrade = complete ? Math.min(...logs.filter((l) => l.topics.length >= 3 && addr(l.topics[1]) !== ZERO).map((l) => parseInt(l.blockNumber, 16))) : Infinity;
    const launchEnd = firstTrade + Math.round(60_000 / BLOCK_MS);
    const byBlock = new Map<number, Set<string>>();
    for (const l of logs) {
      if (l.topics.length < 3) continue;
      const f = addr(l.topics[1]), to = addr(l.topics[2]);
      if (!wallets.has(to)) continue;
      if (wallets.has(f)) link(f, to, "transfer");
      else if (eoaSender.has(f)) (bySource.get(f) ?? bySource.set(f, new Set()).get(f)!).add(to);
      else if (f !== ZERO) {
        (byTx.get(l.transactionHash) ?? byTx.set(l.transactionHash, new Set()).get(l.transactionHash)!).add(to);
        const b = parseInt(l.blockNumber, 16);
        if (b <= launchEnd) (byBlock.get(b) ?? byBlock.set(b, new Set()).get(b)!).add(to);
      }
    }
    for (const group of bySource.values()) { const g = [...group]; for (let i = 1; i < g.length; i++) link(g[0], g[i], "same_source"); }
    for (const group of byTx.values()) { const g = [...group]; for (let i = 1; i < g.length; i++) link(g[0], g[i], "same_tx"); }
    for (const group of byBlock.values()) { const g = [...group]; if (g.length >= 3) for (let i = 1; i < g.length; i++) link(g[0], g[i], "same_block"); }

    // union-find clusters over wallet links
    const parent = new Map<string, string>();
    const find = (x: string): string => { let p = parent.get(x) ?? x; if (p !== x) { p = find(p); parent.set(x, p); } return p; };
    for (const { a, b } of links.values()) parent.set(find(a), find(b));
    const groups = new Map<string, string[]>();
    for (const w of wallets) { const r = find(w); (groups.get(r) ?? groups.set(r, []).get(r)!).push(w); }
    const pctOf = new Map(nodes.map((n) => [n.address, n.pct]));
    const clusters: BubbleCluster[] = [...groups.values()]
      .filter((g) => g.length > 1)
      .map((g) => ({ g, pct: g.reduce((s, a) => s + (pctOf.get(a) ?? 0), 0) }))
      .sort((a, b) => b.pct - a.pct)
      .map(({ g, pct }, i) => {
        const inG = new Set(g);
        const reasons = [...new Set([...links.values()].filter((l) => inG.has(l.a) && inG.has(l.b)).map((l) => l.kind))];
        return { id: i + 1, wallets: g, pct, reasons };
      });
    for (const c of clusters) for (const w of c.wallets) nodes.find((n) => n.address === w)!.cluster = c.id;

    const sum = (f: (n: BubbleNode) => boolean) => nodes.filter(f).reduce((s, n) => s + n.pct, 0);
    const oldestTs = Date.now() - (head - oldest) * BLOCK_MS;
    return {
      token: { symbol: t.symbol, name: t.name, address: token, pool: t.pool, image: t.image },
      supply,
      coverage: { complete, hours: Math.round(((Date.now() - oldestTs) / 3_600_000) * 10) / 10, samples, transfers: logs.length },
      nodes,
      links: [...links.values()],
      clusters,
      summary: {
        walletsPct: sum((n) => n.kind === "wallet"),
        clusteredPct: clusters.reduce((s, c) => s + c.pct, 0),
        topClusterPct: clusters[0]?.pct ?? 0,
        topWalletPct: Math.max(0, ...nodes.filter((n) => n.kind === "wallet").map((n) => n.pct)),
        contractsPct: sum((n) => n.kind === "contract" || n.kind === "pool"),
        burnedPct: sum((n) => n.kind === "burn"),
      },
      at: Date.now(),
    };
  });
}
