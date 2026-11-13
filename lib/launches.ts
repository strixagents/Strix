import { cached } from "./cache";
import { BLOCK_MS, TRANSFER_TOPIC, multicall, rpc, sel, toBig, units } from "./evm";
import { scanContract, type ContractScan } from "./contract";
import { fakeVolume, getNewPools, risksFor, type Token } from "./rhchain";

/**
 * Launch Scanner: every pool created on Robinhood Chain in the last 24h, with a launch check
 * built from free on-chain reads — the contract's admin powers (bytecode), how much of the supply
 * the first-minute buyers ("snipers") took, copycat / fake-liquidity / fake-volume flags — rolled
 * into an early A–F grade with the reasons behind it.
 */

export type Snipers = { buyers: number; sharePct: number; windowSec: number } | null;
export type Launch = {
  token: Token;
  contract: Pick<ContractScan, "verdict" | "findings" | "issuer"> | null;
  snipers: Snipers;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  reasons: { tone: "bad" | "warn" | "good"; text: string }[];
};

const ZERO = "0x" + "0".repeat(40);
const NOT_LAUNCHES = new Set(["WETH", "ETH", "USDG", "USDC", "USDT", "USDE", "DAI", "PYUSD", "USD1"]);
const DEAD = "0x000000000000000000000000000000000000dead";
const SNIPE_WINDOW_SEC = 60;
const topicAddr = (t: string) => ("0x" + t.slice(26)).toLowerCase();

/** Who bought in the first minute after the pool opened, and what share of the supply they took. */
async function snipers(t: Token): Promise<Snipers> {
  if (!t.createdAt) return null;
  const created = Date.parse(t.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > 24 * 3_600_000) return null;
  return cached(`snipe:${t.pool.toLowerCase()}`, 30 * 60_000, async () => {
    const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
    const startBlock = Math.max(0, head - Math.round((Date.now() - created) / BLOCK_MS) - 300);
    const endBlock = Math.min(head, startBlock + 300 + Math.round((SNIPE_WINDOW_SEC * 1000) / BLOCK_MS));
    const logs = await rpc<{ topics: string[]; data: string }[]>("eth_getLogs", [
      { address: t.address, fromBlock: "0x" + startBlock.toString(16), toBlock: "0x" + endBlock.toString(16), topics: [TRANSFER_TOPIC] },
    ]);
    if (!logs.length) return { buyers: 0, sharePct: 0, windowSec: SNIPE_WINDOW_SEC };
    // the pool (or the v4 pool manager) is whoever sends the most transfers in the window
    const senders = new Map<string, number>();
    for (const l of logs) senders.set(topicAddr(l.topics[1]), (senders.get(topicAddr(l.topics[1])) ?? 0) + 1);
    const source = [...senders.entries()].filter(([a]) => a !== ZERO).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!source) return { buyers: 0, sharePct: 0, windowSec: SNIPE_WINDOW_SEC };
    const [dec, supply] = await multicall([{ target: t.address, data: sel.decimals }, { target: t.address, data: "0x18160ddd" }]);
    const d = Number(toBig(dec)) || 18;
    const total = units(toBig(supply), d);
    const bought = new Map<string, number>();
    for (const l of logs) {
      if (topicAddr(l.topics[1]) !== source) continue;
      const to = topicAddr(l.topics[2]);
      if (to === ZERO || to === DEAD || to === source) continue;
      bought.set(to, (bought.get(to) ?? 0) + units(toBig(l.data), d));
    }
    const sum = [...bought.values()].reduce((a, b) => a + b, 0);
    return { buyers: bought.size, sharePct: total > 0 ? (sum / total) * 100 : 0, windowSec: SNIPE_WINDOW_SEC };
  });
}

const GRADE = (s: number): Launch["grade"] => (s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F");
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

function grade(t: Token, contract: Launch["contract"], sn: Snipers): Pick<Launch, "score" | "grade" | "reasons"> {
  let score = 100;
  const reasons: Launch["reasons"] = [];
  const bad = (pts: number, text: string) => { score -= pts; reasons.push({ tone: "bad", text }); };
  const warn = (pts: number, text: string) => { score -= pts; reasons.push({ tone: "warn", text }); };
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
  if (sn && sn.buyers >= 20 && sn.sharePct >= 25) bad(30, `Bundled launch: ${sn.buyers} wallets took ${sn.sharePct.toFixed(0)}% of supply in the first minute`);
  else if (sn && sn.sharePct >= 30) bad(25, `First-minute buyers took ${sn.sharePct.toFixed(0)}% of supply`);
  else if (sn && sn.sharePct >= 15) warn(12, `First-minute buyers took ${sn.sharePct.toFixed(0)}% of supply`);
  else if (sn && sn.buyers > 0) reasons.push({ tone: "good", text: `First minute: ${sn.buyers} buyer${sn.buyers === 1 ? "" : "s"}, ${sn.sharePct.toFixed(1)}% of supply` });
  const r = risksFor(t);
  if (r.flags.includes("wash_volume")) warn(15, "Volume far exceeds liquidity — likely wash trading");
  if (r.flags.includes("spoofed_name")) bad(40, "Disguised name (hidden characters)");
  if (t.txns.h24.sells === 0 && t.txns.h24.buys > 20) warn(15, "Buys but no sells yet — check it can be sold");
  score = Math.max(0, Math.min(100, score));
  reasons.sort((a, b) => ({ bad: 0, warn: 1, good: 2 })[a.tone] - ({ bad: 0, warn: 1, good: 2 })[b.tone]);
  return { score, grade: GRADE(score), reasons };
}

/** The newest launches with their launch checks (contract + sniper reads run in parallel, cached). */
export async function getLaunches(limit = 24): Promise<{ launches: Launch[]; scannedAt: number }> {
  return cached("launches:v2", 60_000, async () => {
    const pools = (await getNewPools())
      .filter((t) => (t.ageHours ?? 99) <= 24 && !NOT_LAUNCHES.has(t.symbol.toUpperCase()))
      .sort((a, b) => (a.ageHours ?? 99) - (b.ageHours ?? 99))
      .slice(0, limit);
    const launches = await Promise.all(
      pools.map(async (t) => {
        const [c, sn] = await Promise.all([
          scanContract(t.address, t.symbol).then((s) => ({ verdict: s.verdict, findings: s.findings, issuer: s.issuer })).catch(() => null),
          snipers(t).catch(() => null),
        ]);
        return { token: t, contract: c, snipers: sn, ...grade(t, c, sn) };
      })
    );
    // official stock tokens and other issuer-managed assets are not launches
    return { launches: launches.filter((l) => l.contract?.verdict !== "issuer"), scannedAt: Date.now() };
  });
}
