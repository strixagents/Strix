import { getLaunches } from "@/lib/launches";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json(await getLaunches());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
