import { getNewPools, getTopTokens, getTrending, risksFor, signalsFor } from "@/lib/rhchain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ?list=top|trending|new
export async function GET(req: Request) {
  const list = new URL(req.url).searchParams.get("list") || "top";
  try {
    const tokens = list === "new" ? await getNewPools() : list === "trending" ? await getTrending() : await getTopTokens();
    return Response.json({
      list,
      rows: tokens.map((t) => ({ ...t, signals: signalsFor(t), risk: risksFor(t) })),
      scannedAt: Date.now(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
