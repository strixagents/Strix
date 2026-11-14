import { rateLimit } from "@/lib/cache";
import { pushConfigured, vapidPublicKey, type PushSub } from "@/lib/push";
import { removeDevice, sendBriefTo, sendTest, upsertDevice, type DeviceAlert, type DeviceWatch } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** GET: the public key a browser needs to subscribe (null when push isn't set up on this server). */
export async function GET() {
  return Response.json({ enabled: pushConfigured(), key: vapidPublicKey() });
}

const B64U = /^[A-Za-z0-9_-]+={0,2}$/;
function readSub(v: unknown): PushSub | null {
  const s = v as PushSub;
  if (!s || typeof s.endpoint !== "string" || !s.keys) return null;
  try {
    const u = new URL(s.endpoint);
    if (u.protocol !== "https:" || s.endpoint.length > 1000) return null;
  } catch {
    return null;
  }
  const { p256dh, auth } = s.keys;
  if (typeof p256dh !== "string" || typeof auth !== "string" || !B64U.test(p256dh) || !B64U.test(auth) || p256dh.length < 80 || p256dh.length > 100 || auth.length < 16 || auth.length > 30) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}
function readAlerts(v: unknown): DeviceAlert[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 30)
    .filter((a) => a && /^0x[0-9a-fA-F]{40,64}$/.test(a.pool) && typeof a.symbol === "string" && Number.isFinite(+a.price) && +a.price > 0 && (a.dir === "above" || a.dir === "below"))
    .map((a) => ({ id: String(a.id ?? `${a.pool}-${a.price}`).slice(0, 64), pool: a.pool, symbol: String(a.symbol).slice(0, 24), price: +a.price, dir: a.dir }));
}

function readWatch(v: unknown): DeviceWatch[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 8).filter((w) => w && /^0x[0-9a-fA-F]{40,64}$/.test(w.pool) && typeof w.symbol === "string").map((w) => ({ pool: w.pool, symbol: String(w.symbol).slice(0, 24) }));
}

/** POST { action: "subscribe" | "unsubscribe" | "test" | "brief", sub, alerts?, radar?, watch?, brief? } */
export async function POST(req: Request) {
  if (!pushConfigured()) return Response.json({ error: "Push notifications are not configured on this server." }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (!rateLimit(`push:${ip}`, 40, 10 * 60_000)) return Response.json({ error: "Too many requests — try again in a few minutes." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; sub?: unknown; alerts?: unknown; radar?: unknown; watch?: unknown; brief?: unknown };
  const sub = readSub(body.sub);
  if (!sub) return Response.json({ error: "Invalid push subscription." }, { status: 400 });
  if (body.action === "unsubscribe") {
    await removeDevice(sub.endpoint);
    return Response.json({ ok: true });
  }
  if (body.action === "test") {
    if (!rateLimit(`pushtest:${ip}`, 5, 10 * 60_000)) return Response.json({ error: "Too many test notifications." }, { status: 429 });
    return Response.json(await sendTest(sub.endpoint));
  }
  if (body.action === "brief") {
    if (!rateLimit("pushbrief:" + ip, 3, 10 * 60_000)) return Response.json({ error: "Too many briefs." }, { status: 429 });
    return Response.json(await sendBriefTo(sub.endpoint));
  }
  const r = await upsertDevice(sub, readAlerts(body.alerts), body.radar !== false, readWatch(body.watch), body.brief !== false);
  return Response.json({ ok: true, ...r });
}
