import { analyze } from "@/lib/indicators";
import { getCandles, getPool, INTERVALS, links, resolvePool, risksFor, signalsFor, type Candle, type Interval } from "@/lib/rhchain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENDING = Symbol("pending");

// ?pool=0x… or ?q=SYMBOL  &interval=1h
// Token stats come back fast (DexScreener). Candles are awaited at most ~1.5s; if the rate-limited
// candle feed isn't ready yet we return `candlesPending: true` and the fetch keeps warming the cache.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const iv = url.searchParams.get("interval") as Interval;
  const interval = INTERVALS.includes(iv) ? iv : "1h";
  try {
    const pool = await resolvePool(url.searchParams.get("pool") || url.searchParams.get("q") || "WETH");
    const candlesP = getCandles(pool, interval);
    candlesP.catch(() => {});
    const [token, candles] = await Promise.all([
      getPool(pool),
      Promise.race([candlesP.catch((e: Error) => e), new Promise<typeof PENDING>((r) => setTimeout(() => r(PENDING), 1500))]),
    ]);
    const ok = Array.isArray(candles);
    return Response.json({
      token: { ...token, signals: signalsFor(token), risk: risksFor(token), links: links(token) },
      interval,
      candles: ok ? (candles as Candle[]) : [],
      candlesPending: candles === PENDING,
      candleError: candles instanceof Error ? candles.message : null,
      analysis: ok && (candles as Candle[]).length >= 30 ? analyze(candles as Candle[]) : null,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
