import { getBubbleMap } from "@/lib/bubbles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Holder bubble map for a token. ?token=<token address | pool | symbol>
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("token")?.trim();
  if (!q) return Response.json({ error: "Pass ?token=" }, { status: 400 });
  try {
    return Response.json(await getBubbleMap(q));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
