import { getRadar } from "@/lib/radar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await getRadar());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
