import crypto from "node:crypto";
import { getPrices } from "./rhchain";
import { getRadar, type RadarEvent } from "./radar";
import { pushConfigured, sendPush, type Note, type PushSub } from "./push";

/**
 * Push notifications for price alerts and Rug Radar, delivered even when Strix is closed.
 * Each device registers its push subscription with its price alerts; a background checker
 * compares them with live prices every minute and forwards new high-severity radar events.
 *
 * Devices live in memory and, when UPSTASH_REDIS_REST_URL/TOKEN are set (free Upstash tier),
 * are also stored in Redis so they survive restarts. Without Redis, every app open re-registers.
 */

export type DeviceAlert = { id: string; pool: string; symbol: string; price: number; dir: "above" | "below" };
type Device = { id: string; sub: PushSub; alerts: DeviceAlert[]; radar: boolean; created: number; seen: number; sent: number[] };

type State = { devices: Map<string, Device>; loaded: boolean; timer?: ReturnType<typeof setInterval>; radarSince: number; running: boolean };
const G = globalThis as unknown as { __strixNotify?: State };
const S: State = (G.__strixNotify ??= { devices: new Map(), loaded: false, radarSince: Date.now(), running: false });

const KEY = "strix:push:devices";
const RADAR_TYPES = new Set(["liquidity_pull", "crash", "mint"]);
const MAX_PER_HOUR = 6;

export const deviceId = (endpoint: string) => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 24);

/* ───────────── optional persistence (Upstash Redis REST, free tier) ───────────── */
const redisOn = () => !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
async function redis<T = unknown>(cmd: (string | number)[]): Promise<T | null> {
  if (!redisOn()) return null;
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { result: T }).result;
}
const save = (d: Device) => redis(["HSET", KEY, d.id, JSON.stringify(d)]).catch(() => null);
const drop = (id: string) => redis(["HDEL", KEY, id]).catch(() => null);
async function load() {
  if (S.loaded) return;
  S.loaded = true;
  const flat = await redis<string[]>(["HGETALL", KEY]).catch(() => null);
  for (let i = 0; flat && i < flat.length; i += 2) {
    try {
      const d = JSON.parse(flat[i + 1]) as Device;
      if (!S.devices.has(d.id)) S.devices.set(d.id, d);
    } catch {}
  }
}

/* ───────────── registration ───────────── */
export async function upsertDevice(sub: PushSub, alerts: DeviceAlert[], radar: boolean) {
  await load();
  const id = deviceId(sub.endpoint);
  const cur = S.devices.get(id);
  const d: Device = { id, sub, alerts: alerts.slice(0, 30), radar, created: cur?.created ?? Date.now(), seen: Date.now(), sent: cur?.sent ?? [] };
  S.devices.set(id, d);
  await save(d);
  startNotifier();
  return { id, alerts: d.alerts.length, radar, persistent: redisOn() };
}

export async function removeDevice(endpoint: string) {
  await load();
  const id = deviceId(endpoint);
  S.devices.delete(id);
  await drop(id);
}

export async function sendTest(endpoint: string) {
  await load();
  const d = S.devices.get(deviceId(endpoint));
  if (!d) return { ok: false, reason: "not registered" };
  const r = await deliver(d, { title: "Strix notifications are on", body: "You'll hear from Strix here when a price alert hits or Rug Radar catches something serious.", url: "/agent?source=push", tag: "strix-test" }, true);
  return { ok: r };
}

/* ───────────── delivery ───────────── */
async function deliver(d: Device, note: Note, ignoreLimit = false): Promise<boolean> {
  const now = Date.now();
  d.sent = d.sent.filter((t) => now - t < 3_600_000);
  if (!ignoreLimit && d.sent.length >= MAX_PER_HOUR) return false;
  const r = await sendPush(d.sub, note);
  if (!r.ok) console.warn(`[notify] push to ${new URL(d.sub.endpoint).host} failed: ${r.status}`);
  if (r.gone) {
    S.devices.delete(d.id);
    await drop(d.id);
    return false;
  }
  if (r.ok) d.sent.push(now);
  return r.ok;
}

const money = (n: number) => (n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : String(Number(n.toPrecision(4))));

async function tick() {
  if (S.running || !pushConfigured()) return;
  S.running = true;
  try {
    await load();
    const devices = [...S.devices.values()];
    if (!devices.length) return;

    // price alerts — one batched price lookup for every watched pool
    const pools = [...new Set(devices.flatMap((d) => d.alerts.map((a) => a.pool.toLowerCase())))];
    if (pools.length) {
      const prices = await getPrices(pools).catch(() => ({} as Record<string, number | null>));
      for (const d of devices) {
        const hits = d.alerts.filter((a) => {
          const p = prices[a.pool.toLowerCase()];
          return p != null && (a.dir === "above" ? p >= a.price : p <= a.price);
        });
        if (!hits.length) continue;
        for (const a of hits) {
          const now = prices[a.pool.toLowerCase()]!;
          await deliver(d, { title: `${a.symbol} ${a.dir === "above" ? "▲" : "▼"} $${money(a.price)}`, body: `${a.symbol} is ${a.dir} your alert — now $${money(now)}.`, url: `/app?pool=${a.pool}&source=push`, tag: `alert-${a.id}` }, true);
        }
        d.alerts = d.alerts.filter((a) => !hits.includes(a));
        await save(d);
      }
    }

    // Rug Radar — new high-severity liquidity pulls, crashes and mints
    const radar = await getRadar().catch(() => null);
    const fresh: RadarEvent[] = (radar?.events ?? []).filter((e) => e.at > S.radarSince && e.severity === "high" && RADAR_TYPES.has(e.type));
    if (fresh.length) {
      S.radarSince = Math.max(...fresh.map((e) => e.at));
      const top = fresh.slice(0, 3);
      const note: Note =
        fresh.length === 1
          ? { title: `Rug Radar · ${fresh[0].title} · ${fresh[0].symbol}`, body: fresh[0].detail, url: "/radar?source=push", tag: `radar-${fresh[0].id}` }
          : { title: `Rug Radar · ${fresh.length} new red flags`, body: top.map((e) => `${e.symbol}: ${e.title}`).join(" · "), url: "/radar?source=push", tag: `radar-${Date.now()}` };
      for (const d of devices) if (d.radar && S.devices.has(d.id)) await deliver(d, note);
    }
  } finally {
    S.running = false;
  }
}

/** Start the background checker once per server process (every 60s). */
export function startNotifier(intervalMs = 60_000) {
  if (S.timer || !pushConfigured()) return;
  S.radarSince = Date.now();
  load().catch(() => {});
  S.timer = setInterval(() => tick().catch((e) => console.error("[notify] tick failed:", (e as Error).message)), intervalMs);
}

export const notifierStats = () => ({ devices: S.devices.size, persistent: redisOn(), running: !!S.timer });
