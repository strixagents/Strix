import { peek, swr } from "./cache";
import { BOT_TX_COUNT, txCounts } from "./evm";
import { getTopTokens, gt, type Token } from "./rhchain";

/**
 * Smart-money leaderboard: real DEX trades from the most liquid Robinhood Chain pools,
 * aggregated per wallet. PnL is the 24h trading result marked to market:
 *   sold USD − bought USD + (tokens bought − tokens sold) × current price
 * Wallets that sent more than BOT_TX_COUNT transactions (bots / order relayers) are excluded.
 */

type GTTrades = {
  data: {
    attributes: {
      block_timestamp: string; tx_from_address: string; kind: "buy" | "sell";
      from_token_amount: string; to_token_amount: string; volume_in_usd: string; is_anomalous?: boolean;
    };
  }[];
};

export type TokenPnl = { symbol: string; pool: string; pnlUsd: number; boughtUsd: number; soldUsd: number; trades: number };
export type Trader = {
  wallet: string; pnlUsd: number; volumeUsd: number; trades: number; tokens: number; winRate: number; automated: boolean;
  lastActive: string; txCount: number | null; best: TokenPnl | null; positions: TokenPnl[];
};

const SKIP = new Set(["WETH", "ETH", "USDG", "USDC", "USDT"]);

export async function getSmartMoney() {
  return swr("smartmoney", 15 * 60_000, async () => {
    const top = await getTopTokens();
    // the most liquid established tokens (not ETH/stables — their flow is dominated by arbitrage)
    const pools = top
      .filter((t) => !SKIP.has(t.symbol.toUpperCase()) && t.liquidity > 300_000 && (t.ageHours ?? 0) > 72 && !t.copycatOf)
      .slice(0, 14);

    const per = new Map<string, Map<string, { t: Token; buyUsd: number; sellUsd: number; boughtAmt: number; soldAmt: number; trades: number; last: string }>>();
    // first build = someone is waiting → fast lane; scheduled refreshes → slow free lane
    const lane = peek("smartmoney") ? "low" : "high";
    let oldest = Date.now();
    for (const t of pools) {
      const d = await gt<GTTrades>(`/networks/robinhood/pools/${t.pool}/trades?trade_volume_in_usd_greater_than=250`, lane).catch(() => null);
      if (!d) continue;
      const since = Date.now() - 24 * 3_600_000;
      for (const { attributes: a } of d.data) {
        const ts = Date.parse(a.block_timestamp);
        if (a.is_anomalous || ts < since) continue;
        oldest = Math.min(oldest, ts);
        const w = a.tx_from_address.toLowerCase();
        const m = per.get(w) ?? new Map();
        const e = m.get(t.pool) ?? { t, buyUsd: 0, sellUsd: 0, boughtAmt: 0, soldAmt: 0, trades: 0, last: a.block_timestamp };
        const usd = +a.volume_in_usd;
        if (a.kind === "buy") { e.buyUsd += usd; e.boughtAmt += +a.to_token_amount; }
        else { e.sellUsd += usd; e.soldAmt += +a.from_token_amount; }
        e.trades++;
        if (a.block_timestamp > e.last) e.last = a.block_timestamp;
        m.set(t.pool, e);
        per.set(w, m);
      }
    }

    let traders: Trader[] = [...per.entries()].map(([wallet, m]) => {
      const positions: TokenPnl[] = [...m.values()].map((e) => ({
        symbol: e.t.symbol, pool: e.t.pool, trades: e.trades, boughtUsd: e.buyUsd, soldUsd: e.sellUsd,
        pnlUsd: e.sellUsd - e.buyUsd + (e.boughtAmt - e.soldAmt) * e.t.price,
      }));
      const pnl = positions.reduce((s, p) => s + p.pnlUsd, 0);
      const vol = positions.reduce((s, p) => s + p.boughtUsd + p.soldUsd, 0);
      return {
        wallet, automated: false, pnlUsd: pnl, volumeUsd: vol, trades: positions.reduce((s, p) => s + p.trades, 0), tokens: positions.length,
        winRate: positions.filter((p) => p.pnlUsd > 0).length / Math.max(1, positions.length),
        lastActive: [...m.values()].map((e) => e.last).sort().at(-1) ?? "",
        txCount: null, best: [...positions].sort((a, b) => b.pnlUsd - a.pnlUsd)[0] ?? null,
        positions: positions.sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd)).slice(0, 5),
      };
    });

    // meaningful activity only, then drop bots / relayers by their lifetime transaction count
    traders = traders.filter((t) => t.trades >= 2 && t.volumeUsd >= 1_000);
    const shortlist = [...traders].sort((a, b) => Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd)).slice(0, 80);
    const counts = await txCounts(shortlist.map((t) => t.wallet)).catch(() => new Map<string, number>());
    const humans = shortlist
      .map((t) => { const n = counts.get(t.wallet) ?? null; return { ...t, txCount: n, automated: n != null && n > 10_000 }; })
      .filter((t) => t.txCount == null || t.txCount <= BOT_TX_COUNT);
    const botsRemoved = shortlist.length - humans.length;

    return {
      traders: humans.sort((a, b) => b.pnlUsd - a.pnlUsd),
      pools: pools.map((p) => ({ symbol: p.symbol, pool: p.pool })),
      botsRemoved,
      windowHours: Math.max(1, Math.round((Date.now() - oldest) / 3_600_000)),
      updatedAt: Date.now(),
    };
  });
}
