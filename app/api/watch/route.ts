import { getPool, risksFor } from "@/lib/rhchain";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Live rows for the "My Strix" watchlist. ?pools=0xabc,0xdef (max 20)
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("pools") || "";
  const pools = [...new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40,64}$/.test(s)))].slice(0, 20);
  const rows = await Promise.all(
    pools.map(async (pool) => {
      try {
        const t = await getPool(pool);
        const r = risksFor(t);
        return {
          pool, ok: true, symbol: t.symbol, name: t.name, image: t.image, address: t.address,
          price: t.price, change: t.change, liquidity: t.liquidity, volume24: t.volume.h24,
          risk: r.level, flags: r.flags, copycat: !!t.copycatOf,
        };
      } catch {
        return { pool, ok: false };
      }
    }),
  );
  return Response.json({ rows, at: Date.now() });
}
