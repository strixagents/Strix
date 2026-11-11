import { cached } from "./cache";
import { postJson } from "./net";
import { CHAIN, getPool, gt, risksFor, type Token } from "./rhchain";
import { BOT_TX_COUNT, txCounts } from "./evm";

const NET = "robinhood";

/* ───────────── token info (holders, score, honeypot, socials) ───────────── */

export type TokenInfo = {
  address: string; symbol: string; name: string; decimals: number | null; image: string | null;
  description: string | null; websites: string[]; twitter: string | null; telegram: string | null; discord: string | null;
  holders: { count: number | null; top10: number | null; top11_30: number | null; top31_50: number | null; rest: number | null; updatedAt: string | null };
  gtScore: number | null; gtScoreDetails: Record<string, number> | null; verified: boolean;
  honeypot: "yes" | "no" | "unknown"; mintAuthority: string | null; freezeAuthority: string | null;
  developer: string | null; developerHoldingPct: number | null;
};

type GTInfo = {
  data: {
    attributes: {
      address: string; name: string; symbol: string; decimals: number | null; image_url: string | null; description: string | null;
      websites: string[] | null; twitter_handle: string | null; telegram_handle: string | null; discord_url: string | null;
      gt_score: number | null; gt_score_details: Record<string, number> | null; gt_verified: boolean | null;
      holders: { count: number | null; distribution_percentage: Record<string, string> | null; last_updated: string | null } | null;
      mint_authority: string | null; freeze_authority: string | null; is_honeypot: boolean | string | null;
      developer_address: string | null; developer_holding_percentage: string | number | null;
    };
  };
};

const pct = (v: string | number | null | undefined) => (v == null || v === "" ? null : +v);

export async function getTokenInfo(address: string): Promise<TokenInfo> {
  return cached(`an:info:${address.toLowerCase()}`, 600_000, async () => {
    const a = (await gt<GTInfo>(`/networks/${NET}/tokens/${address}/info`, "high")).data.attributes;
    const d = a.holders?.distribution_percentage ?? {};
    const hp = a.is_honeypot;
    return {
      address: a.address, symbol: a.symbol, name: a.name, decimals: a.decimals ?? null,
      image: a.image_url && !a.image_url.includes("missing") ? a.image_url : null,
      description: a.description || null, websites: a.websites ?? [], twitter: a.twitter_handle || null,
      telegram: a.telegram_handle || null, discord: a.discord_url || null,
      holders: {
        count: a.holders?.count ?? null, top10: pct(d.top_10), top11_30: pct(d["11_30"]), top31_50: pct(d["31_50"]), rest: pct(d.rest),
        updatedAt: a.holders?.last_updated ?? null,
      },
      gtScore: a.gt_score ?? null, gtScoreDetails: a.gt_score_details ?? null, verified: !!a.gt_verified,
      honeypot: hp === true || hp === "yes" ? "yes" : hp === false || hp === "no" ? "no" : "unknown",
      mintAuthority: a.mint_authority || null, freezeAuthority: a.freeze_authority || null,
      developer: a.developer_address || null, developerHoldingPct: pct(a.developer_holding_percentage),
    };
  });
}

/* ───────────── whale trades (DEX swaps above a USD threshold) ───────────── */

export type WhaleTrade = { kind: "buy" | "sell"; usd: number; amount: number; price: number; wallet: string; tx: string; time: string; block: number };
export type WhaleReport = {
  minUsd: number; windowHours: number; trades: WhaleTrade[];
  buysUsd: number; sellsUsd: number; buys: number; sells: number; wallets: number;
  topAccumulators: { wallet: string; netUsd: number; trades: number; txCount?: number; bot?: boolean }[];
  topSellers: { wallet: string; netUsd: number; trades: number; txCount?: number; bot?: boolean }[];
  pressure: "Whales buying" | "Whales selling" | "Balanced" | "Quiet";
  /** Trades are attributed to the transaction sender, which can be an aggregator/relayer bot acting for someone else. */
  botShare: number;
  /** Share of whale volume done by the single most active wallet (0–1). */
  topWalletShare: number;
  /** One wallet doing most of the volume while buying and selling ~equally = classic wash trading. */
  washSuspect: boolean;
};

type GTTrades = {
  data: {
    attributes: {
      block_number: number; block_timestamp: string; tx_hash: string; tx_from_address: string; kind: "buy" | "sell";
      from_token_amount: string; to_token_amount: string; price_from_in_usd: string; price_to_in_usd: string;
      volume_in_usd: string; is_anomalous?: boolean;
    };
  }[];
};

/** Threshold scales with pool size so small tokens still show their "whales". */
export const whaleThreshold = (liquidity: number) => (liquidity > 5_000_000 ? 10_000 : liquidity > 1_000_000 ? 2_500 : liquidity > 100_000 ? 1_000 : 250);

export async function getWhales(pool: string, liquidity: number): Promise<WhaleReport> {
  const minUsd = whaleThreshold(liquidity);
  return cached(`an:whales:${pool.toLowerCase()}:${minUsd}`, 60_000, async () => {
    const d = await gt<GTTrades>(`/networks/${NET}/pools/${pool}/trades?trade_volume_in_usd_greater_than=${minUsd}`, "high");
    const since = Date.now() - 24 * 3_600_000;
    const trades: WhaleTrade[] = d.data
      .map((t) => t.attributes)
      .filter((a) => !a.is_anomalous && Date.parse(a.block_timestamp) >= since)
      .map((a) => ({
        kind: a.kind,
        usd: +a.volume_in_usd,
        amount: a.kind === "buy" ? +a.to_token_amount : +a.from_token_amount,
        price: a.kind === "buy" ? +a.price_to_in_usd : +a.price_from_in_usd,
        wallet: a.tx_from_address,
        tx: a.tx_hash,
        time: a.block_timestamp,
        block: a.block_number,
      }));
    const by = new Map<string, { netUsd: number; trades: number; gross: number }>();
    let buysUsd = 0, sellsUsd = 0, buys = 0, sells = 0;
    for (const t of trades) {
      const w = by.get(t.wallet) ?? { netUsd: 0, trades: 0, gross: 0 };
      w.trades++;
      w.gross += t.usd;
      if (t.kind === "buy") { buysUsd += t.usd; buys++; w.netUsd += t.usd; }
      else { sellsUsd += t.usd; sells++; w.netUsd -= t.usd; }
      by.set(t.wallet, w);
    }
    const ranked = [...by.entries()].map(([wallet, v]) => ({ wallet, netUsd: v.netUsd, trades: v.trades, gross: v.gross }));
    const total = buysUsd + sellsUsd;
    const top = [...ranked].sort((a, b) => b.gross - a.gross)[0];
    const topWalletShare = top && total ? top.gross / total : 0;
    const washSuspect = !!top && trades.length >= 6 && topWalletShare > 0.6 && Math.abs(top.netUsd) < 0.2 * top.gross;
    const acc = ranked.filter((r) => r.netUsd > 0).sort((a, b) => b.netUsd - a.netUsd).slice(0, 5);
    const sel = ranked.filter((r) => r.netUsd < 0).sort((a, b) => a.netUsd - b.netUsd).slice(0, 5);
    // tag bots/relayers by how many transactions they have ever sent
    const counts = await txCounts([...acc, ...sel].map((r) => r.wallet)).catch(() => new Map<string, number>());
    const tag = (r: { wallet: string; netUsd: number; trades: number }) => {
      const n = counts.get(r.wallet.toLowerCase());
      return { wallet: r.wallet, netUsd: r.netUsd, trades: r.trades, txCount: n, bot: n != null && n > BOT_TX_COUNT };
    };
    const tagged = [...acc, ...sel].map(tag);
    const botVolume = [...acc, ...sel].reduce((s, r) => s + (tag(r).bot ? r.gross : 0), 0);
    return {
      topWalletShare, washSuspect,
      minUsd, windowHours: 24, trades: trades.slice(0, 40), buysUsd, sellsUsd, buys, sells, wallets: by.size,
      topAccumulators: tagged.slice(0, acc.length),
      topSellers: tagged.slice(acc.length),
      pressure: total === 0 ? "Quiet" : buysUsd > 1.5 * sellsUsd ? "Whales buying" : sellsUsd > 1.5 * buysUsd ? "Whales selling" : "Balanced",
      botShare: total ? botVolume / total : 0,
    };
  });
}

/* ───────────── large on-chain transfers & mints (straight from the RPC) ───────────── */

export type Transfer = { kind: "transfer" | "mint" | "burn"; from: string; to: string; amount: number; usd: number; block: number; tx: string };
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await postJson(CHAIN.rpc, JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), 12_000);
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

/** Non-swap token movements over roughly the last hour: big wallet-to-wallet transfers, mints and burns. */
export async function getLargeTransfers(token: string, decimals: number, price: number, minUsd: number, excludePools: string[]): Promise<Transfer[]> {
  return cached(`an:xfer:${token.toLowerCase()}:${minUsd}`, 60_000, async () => {
    const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
    const skip = new Set(excludePools.map((p) => p.toLowerCase()));
    let span = 30_000; // ~50 min at ~100ms blocks
    let logs: { topics: string[]; data: string; blockNumber: string; transactionHash: string }[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        logs = await rpc("eth_getLogs", [{ address: token, fromBlock: `0x${(head - span).toString(16)}`, toBlock: "latest", topics: [TRANSFER_TOPIC] }]);
        break;
      } catch {
        span = Math.floor(span / 4); // provider range/size limit → narrow the window
      }
    }
    const div = 10 ** decimals;
    // A swap moves the token several times in one tx (pool → router → user). A plain wallet-to-wallet
    // transfer has exactly one Transfer log of this token, so only keep those (plus mints/burns).
    const perTx = new Map<string, number>();
    for (const l of logs) perTx.set(l.transactionHash, (perTx.get(l.transactionHash) ?? 0) + 1);
    return logs
      .filter((l) => perTx.get(l.transactionHash) === 1 || l.topics[1]?.endsWith(ZERO.slice(2)) || l.topics[2]?.endsWith(ZERO.slice(2)))
      .map((l) => {
        const from = `0x${l.topics[1]?.slice(26) ?? ""}`;
        const to = `0x${l.topics[2]?.slice(26) ?? ""}`;
        let raw = 0;
        try { raw = Number(BigInt(l.data)) / div; } catch {}
        const kind: Transfer["kind"] = from === ZERO ? "mint" : to === ZERO ? "burn" : "transfer";
        return { kind, from, to, amount: raw, usd: raw * price, block: parseInt(l.blockNumber, 16), tx: l.transactionHash };
      })
      .filter((t) => t.usd >= minUsd && (t.kind !== "transfer" || (!skip.has(t.from) && !skip.has(t.to))))
      .sort((a, b) => b.block - a.block)
      .slice(0, 25);
  });
}

/* ───────────── scorecard ───────────── */

export type Check = { key: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail: string };
export type Scorecard = { score: number; grade: "A" | "B" | "C" | "D" | "F"; verdict: string; checks: Check[] };

export function buildScorecard(t: Token, info: TokenInfo | null, whales: WhaleReport | null): Scorecard {
  const c: Check[] = [];
  const add = (key: string, label: string, status: Check["status"], detail: string) => c.push({ key, label, status, detail });
  const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`);

  if (info) {
    if (info.honeypot === "yes") add("honeypot", "Honeypot check", "fail", "Flagged as a honeypot — you may not be able to sell");
    else if (info.honeypot === "no") add("honeypot", "Honeypot check", "pass", "Not flagged as a honeypot");
    else add("honeypot", "Honeypot check", "info", "Not checked by the data provider for this token");
  }
  if (t.copycatOf) add("copycat", "Original token", "fail", `Same symbol as an older token (${t.copycatOf.slice(0, 8)}…) — verify the contract`);
  else add("copycat", "Original token", "pass", "No older token uses this symbol");

  add("liquidity", "Liquidity", t.liquidity < 50_000 ? "fail" : t.liquidity < 250_000 ? "warn" : "pass", `${usd(t.liquidity)} in the main pool`);
  if (t.ageHours != null)
    add("age", "Pool age", t.ageHours < 6 ? "fail" : t.ageHours < 72 ? "warn" : "pass", t.ageHours < 48 ? `${Math.round(t.ageHours)} hours old` : `${Math.round(t.ageHours / 24)} days old`);

  if (info?.holders.count != null)
    add("holders", "Holders", info.holders.count < 100 ? "fail" : info.holders.count < 1000 ? "warn" : "pass", `${info.holders.count.toLocaleString("en-US")} holders`);
  if (info?.holders.top10 != null)
    add("concentration", "Top-10 concentration", info.holders.top10 > 95 ? "fail" : info.holders.top10 > 80 ? "warn" : "pass",
      `Top 10 wallets hold ${info.holders.top10.toFixed(1)}% (includes pool & contract wallets)`);
  if (info?.developerHoldingPct != null)
    add("dev", "Developer holding", info.developerHoldingPct > 20 ? "fail" : info.developerHoldingPct > 5 ? "warn" : "pass", `Deployer holds ${info.developerHoldingPct.toFixed(2)}%`);
  if (info?.mintAuthority) add("mint", "Mint authority", "warn", "Supply can still be minted");
  if (info?.freezeAuthority) add("freeze", "Freeze authority", "warn", "Wallets can be frozen");
  if (info?.gtScore != null) add("gtscore", "GeckoTerminal score", info.gtScore < 30 ? "fail" : info.gtScore < 60 ? "warn" : "pass", `${info.gtScore.toFixed(0)} / 100`);
  if (info) {
    const socials = [info.websites.length ? "website" : "", info.twitter ? "X/Twitter" : "", info.telegram ? "Telegram" : ""].filter(Boolean);
    add("socials", "Socials", socials.length ? "pass" : "warn", socials.length ? socials.join(", ") : "No website or socials listed");
    if (info.verified) add("verified", "Verified info", "pass", "Token info verified on GeckoTerminal");
  }
  const r = risksFor(t);
  if (r.flags.includes("wash_volume")) add("wash", "Volume quality", "fail", "24h volume far exceeds liquidity — likely wash trading");
  if (whales?.washSuspect)
    add("washwallet", "Wash trading", "fail", `${Math.round(whales.topWalletShare * 100)}% of large trades come from one wallet buying and selling to itself`);
  if (whales && whales.buys + whales.sells >= 3)
    add("whales", "Whale flow (24h)", whales.washSuspect ? "warn" : whales.pressure === "Whales selling" ? "warn" : "pass",
      `${usd(whales.buysUsd)} bought vs ${usd(whales.sellsUsd)} sold by ${whales.wallets} wallet${whales.wallets === 1 ? "" : "s"}`);

  const fails = c.filter((x) => x.status === "fail").length;
  const warns = c.filter((x) => x.status === "warn").length;
  const score = Math.max(0, Math.min(100, 100 - fails * 22 - warns * 7));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  const verdict =
    grade === "A" ? "Solid on-chain fundamentals" : grade === "B" ? "Mostly healthy, a few things to watch" : grade === "C" ? "Mixed — trade small and watch closely" : grade === "D" ? "Risky — several red flags" : "High risk — multiple serious red flags";
  return { score, grade, verdict, checks: c };
}

/* ───────────── one-shot report ───────────── */

export async function analystReport(pool: string) {
  const t = await getPool(pool);
  const [info, whales] = await Promise.all([getTokenInfo(t.address).catch(() => null), getWhales(t.pool, t.liquidity).catch(() => null)]);
  const transfers =
    info?.decimals != null && t.price > 0
      ? await getLargeTransfers(t.address, info.decimals, t.price, Math.max(whaleThreshold(t.liquidity), 1000), [t.pool]).catch(() => [])
      : [];
  return { token: t, info, whales, transfers, scorecard: buildScorecard(t, info, whales) };
}
