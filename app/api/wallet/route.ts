import { rateLimit } from "@/lib/cache";
import { scanWallet } from "@/lib/wallet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ?address=0x…&hours=24
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`wallet:${ip}`, 20, 60_000)) return Response.json({ error: "Too many wallet scans — wait a minute." }, { status: 429 });
  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").trim();
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24, 1), 72);
  try {
    return Response.json(await scanWallet(address, hours));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
