import { getPrices } from "@/lib/rhchain";

export const dynamic = "force-dynamic";

// Last USD price per pool for browser alerts. ?pools=0xabc,0xdef
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("pools") || "";
  const pools = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^0x[0-9a-fA-F]{40,64}$/.test(s)))].slice(0, 30);
  if (!pools.length) return Response.json({});
  try {
    return Response.json(await getPrices(pools));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
