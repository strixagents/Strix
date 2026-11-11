import { scanContract } from "@/lib/contract";
import { isAddress } from "@/lib/evm";
import { getPool, resolvePool } from "@/lib/rhchain";
import { rateLimit } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/contract?token=PONS | 0x… (token, pool or raw contract address)
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`ct:${ip}`, 40, 60_000)) return Response.json({ error: "Too many requests" }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("token") || "").trim().slice(0, 80);
  if (!q) return Response.json({ error: "token required" }, { status: 400 });
  try {
    let meta: { symbol: string; name: string; pool: string | null } = { symbol: q, name: "", pool: null };
    let address = q;
    try {
      const t = await getPool(await resolvePool(q));
      meta = { symbol: t.symbol, name: t.name, pool: t.pool };
      address = t.address;
    } catch (e) {
      if (!isAddress(q)) throw e; // unindexed tokens can still be scanned by address
    }
    return Response.json({ ...meta, ...(await scanContract(address, meta.symbol)) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
