import { searchTokens } from "@/lib/rhchain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 80);
  try {
    return Response.json({ results: await searchTokens(q) });
  } catch (e) {
    return Response.json({ results: [], error: (e as Error).message }, { status: 502 });
  }
}
