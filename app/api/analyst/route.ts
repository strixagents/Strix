import { analystReport } from "@/lib/analyst";
import { resolvePool } from "@/lib/rhchain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ?pool=0x… or ?q=SYMBOL → holders, scorecard, whale trades, large transfers
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const pool = await resolvePool(url.searchParams.get("pool") || url.searchParams.get("q") || "WETH");
    return Response.json(await analystReport(pool));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
}
