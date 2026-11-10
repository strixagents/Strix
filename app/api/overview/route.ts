import { getNetworkStatus, getTopTokens, getTrending, risksFor, signalsFor, trusted } from "@/lib/rhchain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const [top, trending, network] = await Promise.all([
      getTopTokens(),
      getTrending({ wait: false }).catch(() => []),
      getNetworkStatus().catch(() => null),
    ]);
    const tokens = top.slice(0, 40).map((t) => ({ ...t, signals: signalsFor(t), risk: risksFor(t) }));
    // rankings and totals only count real tokens — copycats and fake liquidity would distort them
    const real = top.filter(trusted);
    const liquid = real.filter((t) => t.liquidity > 100_000);
    const byChange = [...liquid].sort((a, b) => b.change.h24 - a.change.h24);
    return Response.json({
      network,
      tokens,
      trending: trending.slice(0, 10),
      gainers: byChange.slice(0, 5),
      losers: byChange.slice(-5).reverse(),
      stats: {
        volume24h: real.reduce((s, t) => s + t.volume.h24, 0),
        liquidity: real.reduce((s, t) => s + t.liquidity, 0),
        tokens: top.length,
      },
      updatedAt: Date.now(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
