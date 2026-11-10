import { getSmartMoney } from "@/lib/smartmoney";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    return Response.json(await getSmartMoney());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
