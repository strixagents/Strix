import { BLOCK_MS, TRANSFER_TOPIC, multicall, rpc, sel, toBig, units } from "./evm";
import { getNewPools, getTopTokens, getTrending, type Token } from "./rhchain";
import { getStockTokens } from "./stocks";

/**
 * Rug Radar — a background watcher over Robinhood Chain pools (top, trending, newest).
 * Every cycle it samples live liquidity/price (DexScreener via the cached lists), reads mint
 * events straight from the chain, and records events:
 *   - liquidity_pull: pool liquidity fell ≥50% from its recent high (classic rug)
 *   - crash: price fell ≥50% (from our samples, or the 1h change on first sight)
 *   - mint: supply minted from 0x0 worth ≥2% of total supply (excluding stock tokens / WETH / stables)
 *   - copycat: a new pool reusing the symbol of an older, established token
 * Everything is real data; history starts when the server starts (shown as "monitoring since").
 */

export type RadarEvent = {
  id: string; type: "liquidity_pull" | "crash" | "mint" | "copycat"; severity: "high" | "medium";
  at: number; symbol: string; name: string; pool: string; token: string; image: string | null;
  title: string; detail: string; liquidity: number; price: number;
};

type Sample = { at: number; liq: number; price: number };
type State = {
  started: number; lastScan: number; scans: number; watching: number;
  samples: Map<string, Sample[]>; events: RadarEvent[]; seen: Set<string>; lastMintBlock: number; running: boolean; timer?: ReturnType<typeof setInterval>; current?: Promise<void>;
};

const G = globalThis as unknown as { __strixRadar?: State };
const initial: State = {
  started: Date.now(), lastScan: 0, scans: 0, watching: 0, samples: new Map<string, Sample[]>(), events: [], seen: new Set<string>(), lastMintBlock: 0, running: false,
};
const S: State = (G.__strixRadar ??= initial);

const WINDOW_MS = 60 * 60_000; // compare against the last hour
const ZERO_TOPIC = "0x" + "0".repeat(64);
const SKIP_MINT = new Set(["WETH", "ETH", "USDG", "USDC", "USDT", "DAI", "PYUSD", "USD1", "USDE"]);
const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

function push(e: Omit<RadarEvent, "id">) {
  // one event per token+type per 30 minutes
  const key = `${e.type}:${e.pool.toLowerCase()}:${Math.floor(e.at / (30 * 60_000))}`;
  if (S.seen.has(key)) return;
  S.seen.add(key);
  S.events.unshift({ ...e, id: key });
  S.events = S.events.slice(0, 300);
}

function scan(): Promise<void> {
  // concurrent callers share the scan that is already running
  if (S.current) return S.current;
  S.current = doScan().finally(() => {
    S.current = undefined;
  });
  return S.current;
}

async function doScan() {
  S.running = true;
  try {
    const [top, trending, fresh, stocks] = await Promise.all([
      getTopTokens().catch(() => [] as Token[]),
      getTrending().catch(() => [] as Token[]),
      getNewPools().catch(() => [] as Token[]),
      getStockTokens().catch(() => []),
    ]);
    const stockAddr = new Set(stocks.map((s) => s.token.address.toLowerCase()));
    const all = new Map<string, Token>();
    for (const t of [...top, ...trending, ...fresh]) all.set(t.pool.toLowerCase(), t);
    S.watching = all.size;
    const now = Date.now();

    for (const t of all.values()) {
      const k = t.pool.toLowerCase();
      const hist = (S.samples.get(k) ?? []).filter((s) => now - s.at <= WINDOW_MS);
      const peakLiq = Math.max(0, ...hist.map((s) => s.liq));
      const peakPrice = Math.max(0, ...hist.map((s) => s.price));
      const base = { at: now, symbol: t.symbol, name: t.name, pool: t.pool, token: t.address, image: t.image, liquidity: t.liquidity, price: t.price };

      // liquidity pulled out of the pool
      if (peakLiq >= 20_000 && t.liquidity < peakLiq * 0.5) {
        const drop = (1 - t.liquidity / peakLiq) * 100;
        push({ ...base, type: "liquidity_pull", severity: drop > 80 ? "high" : "medium", title: `Liquidity pulled −${drop.toFixed(0)}%`, detail: `Pool liquidity fell from ${usd(peakLiq)} to ${usd(t.liquidity)} within the last hour.` });
      }
      // price crash — from our own samples, or the 1h change the first time we see the pool
      const crashFromSamples = peakPrice > 0 && t.price < peakPrice * 0.5;
      const crashFromFeed = hist.length === 0 && t.change.h1 <= -50;
      if ((crashFromSamples || crashFromFeed) && t.liquidity >= 1_000) {
        const drop = crashFromSamples ? (1 - t.price / peakPrice) * 100 : -t.change.h1;
        push({ ...base, type: "crash", severity: drop > 80 ? "high" : "medium", title: `Price crashed −${drop.toFixed(0)}%`, detail: crashFromSamples ? `From $${peakPrice.toPrecision(4)} to $${t.price.toPrecision(4)} within the last hour.` : `Down ${drop.toFixed(0)}% over the last hour.` });
      }
      // copycat launches
      if (t.copycatOf && (t.ageHours ?? 99) < 24) {
        push({ ...base, type: "copycat", severity: "high", title: `Copycat ${t.symbol} launched`, detail: `Reuses the symbol of an older token (${t.copycatOf.slice(0, 8)}…). Pool is ${(t.ageHours ?? 0) < 1 ? `${Math.max(1, Math.round((t.ageHours ?? 0) * 60))} min` : `${Math.round(t.ageHours ?? 0)}h`} old with ${t.fakeLiquidity ? "a fake (impossible) liquidity figure" : `${usd(t.liquidity)} liquidity`}.` });
      }
      hist.push({ at: now, liq: t.liquidity, price: t.price });
      S.samples.set(k, hist.slice(-120));
    }

    // supply mints read directly from the chain (one getLogs over all watched tokens)
    const tokens = [...new Map([...all.values()].map((t) => [t.address.toLowerCase(), t])).values()].filter(
      (t) => !/^0x0{40}$/i.test(t.address) && !SKIP_MINT.has(t.symbol.toUpperCase()) && !stockAddr.has(t.address.toLowerCase()) && (t.ageHours ?? 0) > 2
    );
    const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
    const from = Math.max(S.lastMintBlock + 1, head - 29_999);
    if (tokens.length && from <= head) {
      const logs = await rpc<{ address: string; data: string; blockNumber: string; transactionHash: string }[]>("eth_getLogs", [
        { address: tokens.map((t) => t.address), fromBlock: "0x" + from.toString(16), toBlock: "0x" + head.toString(16), topics: [TRANSFER_TOPIC, ZERO_TOPIC] },
      ]).catch(() => []);
      S.lastMintBlock = head;
      if (logs.length) {
        const minted = new Map<string, bigint>();
        for (const l of logs) minted.set(l.address.toLowerCase(), (minted.get(l.address.toLowerCase()) ?? 0n) + toBig(l.data));
        const addrs = [...minted.keys()];
        const meta = await multicall(addrs.flatMap((a) => [{ target: a, data: sel.decimals }, { target: a, data: "0x18160ddd" }])).catch(() => [] as (string | null)[]);
        addrs.forEach((a, i) => {
          const t = tokens.find((x) => x.address.toLowerCase() === a);
          if (!t) return;
          const dec = Number(toBig(meta[i * 2] ?? null)) || 18;
          const supply = units(toBig(meta[i * 2 + 1] ?? null), dec);
          const amount = units(minted.get(a)!, dec);
          const share = supply > 0 ? (amount / supply) * 100 : 0;
          if (share < 2) return;
          push({
            at: Date.now() - Math.round((head - from) * BLOCK_MS * 0.5), symbol: t.symbol, name: t.name, pool: t.pool, token: t.address, image: t.image,
            liquidity: t.liquidity, price: t.price, type: "mint", severity: share >= 10 ? "high" : "medium",
            title: `Supply minted +${share.toFixed(1)}%`,
            detail: `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} new ${t.symbol} created (≈${usd(amount * t.price)}). New supply dilutes holders and can be dumped.`,
          });
        });
      }
    }
    S.lastScan = Date.now();
    S.scans++;
  } finally {
    S.running = false;
  }
}

/** Start the background watcher once per server process. */
export function startRadar(intervalMs = 120_000) {
  if (S.timer) return;
  S.started = Date.now();
  scan().catch(() => {});
  S.timer = setInterval(() => scan().catch(() => {}), intervalMs);
}

export async function getRadar() {
  if (!S.timer) startRadar();
  if (!S.scans) await scan().catch(() => {});
  return { events: S.events, monitoringSince: S.started, lastScan: S.lastScan, scans: S.scans, watching: S.watching };
}
