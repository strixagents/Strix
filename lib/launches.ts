import { cached } from "./cache";
import { BLOCK_MS, TRANSFER_TOPIC, addrWord, multicall, rpc, sel, toBig, units } from "./evm";
import { scanContract, type ContractScan } from "./contract";
import { fakeVolume, getNewPools, risksFor, type Token } from "./rhchain";

/**
 * Launch Scanner: every pool created on Robinhood Chain in the last 24h, with a launch check
 * built only from free on-chain reads:
 *  - the contract's admin powers (bytecode),
 *  - the first minute: how many wallets bought and what share of supply they took (bundles/snipers),
 *  - the developer: the wallet that sent the minting transaction, what it still holds, what it moved,
 *    and how many of today's launches came from the same wallet (serial launchers),
 *  - a sell test: a simulated transfer from a real buyer back into the pool (eth_call) — a revert
 *    means holders may not be able to sell,
 *  - copycat / fake-liquidity / spoofed-volume flags,
 * rolled into an early A–F grade with the reasons behind it.
 */

export type Snipers = { buyers: number; sharePct: number; windowSec: number } | null;
export type Dev = { address: string; holdingPct: number; movedPct: number; launches: number } | null;
export type Launch = {
  token: Token;
  contract: Pick<ContractScan, "verdict" | "findings" | "issuer"> | null;
  snipers: Snipers;
  dev: Dev;
  sellable: boolean | null;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  reasons: { tone: "bad" | "warn" | "good"; text: string }[];
};

const ZERO = "0x" + "0".repeat(40);
const ZERO_TOPIC = "0x" + "0".repeat(64);
const NOT_LAUNCHES = new Set(["WETH", "ETH", "USDG", "USDC", "USDT", "USDE", "DAI", "PYUSD", "USD1"]);
const DEAD = "0x000000000000000000000000000000000000dead";
const SNIPE_WINDOW_SEC = 60;
const topicAddr = (t: string) => ("0x" + t.slice(26)).toLowerCase();
/** Run fn over items with at most n in flight — keeps the public RPC from rate-limiting a burst of launches. */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
/** One retry after a short pause for a flaky RPC read. */
const retry = <T>(f: () => Promise<T>) => f().catch(() => new Promise<T>((res, rej) => setTimeout(() => f().then(res, rej), 600)));

type Log = { topics: string[]; data: string; transactionHash: string; blockNumber: string; logIndex: string };

/** The block produced at a given time, found by refining an estimate against real block timestamps. */
async function blockAt(ms: number, head: number): Promise<number> {
  const ts = async (b: number) => parseInt((await rpc<{ timestamp: string }>("eth_getBlockByNumber", ["0x" + b.toString(16), false])).timestamp, 16) * 1000;
  const headTs = await ts(head);
  let b = Math.max(0, head - Math.round((headTs - ms) / BLOCK_MS));
  for (let i = 0; i < 5; i++) {
    const tb = await ts(b);
    const rate = head > b ? (headTs - tb) / (head - b) : BLOCK_MS; // measured ms per block over this stretch
    const step = Math.round((ms - tb) / Math.max(rate, 1));
    if (Math.abs(step) <= 5) break;
    b = Math.min(head, Math.max(0, b + step));
  }
  return b;
}

type Facts = { snipers: Snipers; devAddress: string | null; devGot: number; source: string | null; buyers: [string, number][]; decimals: number; total: number };

/** One pass over the launch: first-minute buys, the pool/pool-manager address and the developer. */
async function launchFacts(t: Token): Promise<Facts | null> {
  if (!t.createdAt) return null;
  const created = Date.parse(t.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > 24 * 3_600_000) return null;
  return cached(`lfacts3:${t.pool.toLowerCase()}`, 30 * 60_000, async () => {
    const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
    const opened = await blockAt(created, head);
    const window = (from: number, to: number, topics: (string | null)[]) =>
      retry(() => rpc<Log[]>("eth_getLogs", [{ address: t.address, fromBlock: "0x" + Math.max(0, from).toString(16), toBlock: "0x" + Math.min(head, to).toString(16), topics }]));
    const [logs, mints, meta] = await Promise.all([
      window(opened - 150, opened + Math.round((SNIPE_WINDOW_SEC * 1000) / BLOCK_MS) + 50, [TRANSFER_TOPIC]),
      // the token is usually minted in (or shortly before) the launch transaction
      window(opened - 3000, opened + 50, [TRANSFER_TOPIC, ZERO_TOPIC]).catch(() => [] as Log[]),
      multicall([{ target: t.address, data: sel.decimals }, { target: t.address, data: "0x18160ddd" }]),
    ]);
    const decimals = Number(toBig(meta[0])) || 18;
    const total = units(toBig(meta[1]), decimals);

    // developer = the wallet that sent the first minting transaction
    let devAddress: string | null = null;
    if (mints.length) {
      const tx = await retry(() => rpc<{ from: string } | null>("eth_getTransactionByHash", [mints[0].transactionHash])).catch(() => null);
      devAddress = tx?.from?.toLowerCase() ?? null;
    }
    // the same transfer can appear in both windows — count each log once
    const seen = new Set<string>();
    const all = [...mints, ...logs].filter((l) => { const k = l.transactionHash + ":" + l.logIndex; if (seen.has(k)) return false; seen.add(k); return true; });
    const devGot = devAddress ? all.filter((l) => topicAddr(l.topics[2]) === devAddress).reduce((s, l) => s + units(toBig(l.data), decimals), 0) : 0;

    if (!logs.length) return { snipers: null, devAddress, devGot, source: null, buyers: [], decimals, total };
    // buys come out of the pool: a v2/v3 pool is its own address; a v4 pool lives in the pool manager,
    // which is the address that received the biggest deposit (the liquidity) and then paid tokens out
    let source: string | undefined = t.pool.length === 42 ? t.pool.toLowerCase() : undefined;
    if (!source) {
      const inflow = new Map<string, bigint>();
      const sends = new Set(logs.map((l) => topicAddr(l.topics[1])));
      for (const l of logs) {
        const to = topicAddr(l.topics[2]);
        if (to !== ZERO && to !== DEAD && sends.has(to)) inflow.set(to, (inflow.get(to) ?? 0n) + toBig(l.data));
      }
      source = [...inflow.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0]?.[0];
    }
    if (!source) return { snipers: null, devAddress, devGot, source: null, buyers: [], decimals, total };
    const bought = new Map<string, number>();
    for (const l of logs) {
      if (topicAddr(l.topics[1]) !== source) continue;
      const to = topicAddr(l.topics[2]);
      if (to === ZERO || to === DEAD || to === source) continue;
      bought.set(to, (bought.get(to) ?? 0) + units(toBig(l.data), decimals));
    }
    const sum = [...bought.values()].reduce((a, b) => a + b, 0);
    const share = total > 0 ? Math.min(100, (sum / total) * 100) : 0;
    const buyers = [...bought.entries()].sort((a, b) => b[1] - a[1]);
    // tokens the developer put into the pool as liquidity are not "sold"
    const devLiquidity = devAddress ? all.filter((l) => topicAddr(l.topics[1]) === devAddress && topicAddr(l.topics[2]) === source).reduce((s, l) => s + units(toBig(l.data), decimals), 0) : 0;
    const devKept = Math.max(0, devGot - devLiquidity);
    // nearly the whole supply landing in one to three wallets is the deployer moving supply, not trading — unknown
    const snipers = share >= 95 && bought.size <= 3 ? null : { buyers: bought.size, sharePct: share, windowSec: SNIPE_WINDOW_SEC };
    return { snipers, devAddress, devGot: devKept, source, buyers, decimals, total };
  });
}

/** What the developer holds now, and whether a real buyer can still move tokens back into the pool. */
async function liveChecks(t: Token, f: Facts): Promise<{ holdingPct: number | null; movedPct: number | null; sellable: boolean | null }> {
  return cached(`llive3:${t.pool.toLowerCase()}`, 5 * 60_000, async () => {
    const holders = [f.devAddress, ...f.buyers.slice(0, 4).map(([a]) => a)].filter(Boolean) as string[];
    const bals = holders.length ? await retry(() => multicall(holders.map((a) => ({ target: t.address, data: sel.balanceOf + addrWord(a) })))).catch(() => [] as (string | null)[]) : [];
    const bal = (i: number) => units(toBig(bals[i] ?? null), f.decimals);
    let holdingPct: number | null = null, movedPct: number | null = null;
    if (f.devAddress && f.total > 0) {
      const now = bal(0);
      holdingPct = (now / f.total) * 100;
      movedPct = f.devGot > now ? Math.min(100, ((f.devGot - now) / f.total) * 100) : 0;
    }
    // sell test: simulate a buyer sending 1% of its balance into the pool
    let sellable: boolean | null = null;
    if (f.source) {
      const off = f.devAddress ? 1 : 0;
      const idx = f.buyers.slice(0, 4).findIndex((_, i) => bal(i + off) > 0);
      if (idx >= 0) {
        const from = f.buyers[idx][0];
        const raw = toBig(bals[idx + off] ?? null) / 100n;
        if (raw > 0n) {
          const data = "0xa9059cbb" + addrWord(f.source) + raw.toString(16).padStart(64, "0");
          sellable = await rpc<string>("eth_call", [{ from, to: t.address, data }, "latest"]).then(() => true, (e: Error) => (/revert|execution/i.test(e.message) ? false : null));
        }
      }
    }
    return { holdingPct, movedPct, sellable };
  });
}

const GRADE = (s: number): Launch["grade"] => (s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F");
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

function grade(t: Token, contract: Launch["contract"], sn: Snipers, dev: Dev, sellable: boolean | null): Pick<Launch, "score" | "grade" | "reasons"> {
  let score = 100;
  const reasons: Launch["reasons"] = [];
  const bad = (pts: number, text: string) => { score -= pts; reasons.push({ tone: "bad", text }); };
  const warn = (pts: number, text: string) => { score -= pts; reasons.push({ tone: "warn", text }); };
  if (sellable === false) bad(70, "Sell test failed — a transfer back into the pool reverts (possible honeypot)");
  if (contract?.verdict === "danger") bad(40, contract.findings.find((f) => f.severity === "high")?.label ?? "Dangerous admin powers in the contract");
  else if (contract?.verdict === "caution") warn(15, contract.findings.find((f) => f.severity === "medium")?.label ?? "Some admin powers remain");
  else if (contract?.verdict === "clean") reasons.push({ tone: "good", text: "No admin powers in the contract" });
  if (t.copycatOf) bad(35, "Copycat — an older token uses this symbol");
  if (t.fakeLiquidity) bad(40, "Fake (impossible) liquidity figure");
  if (fakeVolume(t)) bad(30, "Spoofed volume — millions from a handful of trades");
  if (!t.fakeLiquidity) {
    if (t.liquidity < 1) bad(65, "No liquidity left in the pool — it can't be sold");
    else if (t.liquidity < 1_000) bad(35, `Almost no liquidity (${money(t.liquidity)})`);
    else if (t.liquidity < 5_000) bad(20, `Thin liquidity (${money(t.liquidity)})`);
    else if (t.liquidity < 20_000) warn(10, `Low liquidity (${money(t.liquidity)})`);
  }
  if (sn && sn.buyers >= 20 && sn.sharePct >= 25) bad(50, `Bundled launch: ${sn.buyers} wallets took ${sn.sharePct.toFixed(0)}% of supply in the first minute`);
  else if (sn && sn.sharePct >= 30) bad(25, `First-minute buyers took ${sn.sharePct.toFixed(0)}% of supply`);
  else if (sn && sn.sharePct >= 15) warn(12, `First-minute buyers took ${sn.sharePct.toFixed(0)}% of supply`);
  else if (sn && sn.buyers > 0) reasons.push({ tone: "good", text: `First minute: ${sn.buyers} buyer${sn.buyers === 1 ? "" : "s"}, ${sn.sharePct.toFixed(1)}% of supply` });
  if (dev) {
    if (dev.launches >= 5) bad(25, `Serial launcher: this developer launched ${dev.launches} of the last ${LIMIT} tokens`);
    else if (dev.launches >= 2) warn(10, `This developer launched ${dev.launches} tokens today`);
    if (dev.holdingPct >= 50) bad(30, `Developer still holds ${dev.holdingPct.toFixed(0)}% of supply`);
    else if (dev.holdingPct >= 20) warn(15, `Developer holds ${dev.holdingPct.toFixed(0)}% of supply`);
    if (dev.movedPct >= 10) bad(25, `Developer has already moved or sold ${dev.movedPct.toFixed(0)}% of supply`);
    else if (dev.movedPct >= 3) warn(10, `Developer has moved or sold ${dev.movedPct.toFixed(1)}% of supply`);
  }
  if (sellable === true) reasons.push({ tone: "good", text: "Sell test passed — a buyer can move tokens back into the pool" });
  if (!t.fakeLiquidity && t.liquidity >= 1_000_000 && (t.ageHours ?? 99) < 24 && !t.copycatOf)
    warn(25, `Unusually high liquidity for a brand-new token (${money(t.liquidity)}) — verify it is real`);
  if (!sn && !dev && sellable === null) warn(15, "Launch data not readable yet — first-minute buyers, developer and sell test unknown");
  const r = risksFor(t);
  if (r.flags.includes("wash_volume")) warn(15, "Volume far exceeds liquidity — likely wash trading");
  if (r.flags.includes("spoofed_name")) bad(40, "Disguised name (hidden characters)");
  if (t.txns.h24.sells === 0 && t.txns.h24.buys > 20) warn(15, "Buys but no sells yet — check it can be sold");
  score = Math.max(0, Math.min(100, score));
  reasons.sort((a, b) => ({ bad: 0, warn: 1, good: 2 })[a.tone] - ({ bad: 0, warn: 1, good: 2 })[b.tone]);
  return { score, grade: GRADE(score), reasons };
}

const LIMIT = 24;

/** The newest launches with their launch checks (on-chain reads run in parallel and are cached). */
export async function getLaunches(limit = LIMIT): Promise<{ launches: Launch[]; scannedAt: number }> {
  return cached("launches:v9", 60_000, async () => {
    const pools = (await getNewPools())
      .filter((t) => (t.ageHours ?? 99) <= 24 && !NOT_LAUNCHES.has(t.symbol.toUpperCase()))
      .sort((a, b) => (a.ageHours ?? 99) - (b.ageHours ?? 99))
      .slice(0, limit);
    const raw = await mapLimit(pools, 4, async (t) => {
        const [c, f] = await Promise.all([
          scanContract(t.address, t.symbol).then((s) => ({ verdict: s.verdict, findings: s.findings, issuer: s.issuer })).catch(() => null),
          launchFacts(t).catch(() => null),
        ]);
        const live = f ? await liveChecks(t, f).catch(() => null) : null;
        return { t, c, f, live };
      });
    // serial launchers: the same developer wallet behind several of these launches
    const perDev = new Map<string, Set<string>>();
    for (const r of raw) if (r.f?.devAddress) perDev.set(r.f.devAddress, (perDev.get(r.f.devAddress) ?? new Set()).add(r.t.address.toLowerCase()));
    const launches: Launch[] = raw.map(({ t, c, f, live }) => {
      const dev: Dev = f?.devAddress && live?.holdingPct != null
        ? { address: f.devAddress, holdingPct: live.holdingPct, movedPct: live.movedPct ?? 0, launches: perDev.get(f.devAddress)?.size ?? 1 }
        : null;
      const sellable = live?.sellable ?? null;
      return { token: t, contract: c, snipers: f?.snipers ?? null, dev, sellable, ...grade(t, c, f?.snipers ?? null, dev, sellable) };
    });
    // official stock tokens and other issuer-managed assets are not launches
    return { launches: launches.filter((l) => l.contract?.verdict !== "issuer"), scannedAt: Date.now() };
  });
}
