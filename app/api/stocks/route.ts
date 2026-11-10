import { getStockPremiums } from "@/lib/stocks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await getStockPremiums());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
