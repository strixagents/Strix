import crypto from "node:crypto";
import { getPool, getPrices } from "./rhchain";
import { getLaunches } from "./launches";
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
export type DeviceWatch = { pool: string; symbol: string };
type Device = { id: string; sub: PushSub; alerts: DeviceAlert[]; radar: boolean; created: number; seen: number; sent: number[]; watch?: DeviceWatch[]; brief?: boolean; briefDay?: string };

type State = { devices: Map<string, Device>; loaded: boolean; timer?: ReturnType<typeof setInterval>; radarSince: number; running: boolean };
const G = globalThis as unknown as { __strixNotify?: State };
const S: State = (G.__strixNotify ??= { devices: new Map(), loaded: false, radarSince: Date.now(), running: false });

const KEY = "strix:push:devices";
const RADAR_TYPES = new Set(["liquidity_pull", "crash", "mint", "dev_sell"]);
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
export async function upsertDevice(sub: PushSub, alerts: DeviceAlert[], radar: boolean, watch: DeviceWatch[] = [], brief = true) {
  await load();
  const id = deviceId(sub.endpoint);
  const cur = S.devices.get(id);
  const d: Device = { id, sub, alerts: alerts.slice(0, 30), radar, created: cur?.created ?? Date.now(), seen: Date.now(), sent: cur?.sent ?? [], watch: watch.slice(0, 8), brief, briefDay: cur?.briefDay };
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

const BRIEF_HOUR_UTC = 0; // 07:00 in Jakarta
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const plural = (n: number, w: string, ws = w + "s") => n + " " + (n === 1 ? w : ws);

/** The morning brief: your watchlist's 24h moves and what the radar and launch scanner caught overnight. */
async function buildBrief(watch: DeviceWatch[]): Promise<Note> {
  const moves: string[] = [];
  for (const w of watch.slice(0, 4)) {
    const t = await getPool(w.pool).catch(() => null);
    if (t) moves.push(t.symbol + " " + pct(t.change.h24));
  }
  const radar = await getRadar().catch(() => null);
  const since = Date.now() - 12 * 3_600_000;
  const night = (radar?.events ?? []).filter((e) => e.at >= since);
  const pulls = night.filter((e) => e.type === "liquidity_pull").length;
  const crashes = night.filter((e) => e.type === "crash").length;
  const launches = (await getLaunches().catch(() => null))?.launches ?? [];
  const bundled = launches.filter((l) => l.reasons.some((r) => r.text.startsWith("Bundled launch"))).length;
  const clean = launches.filter((l) => l.grade === "A" && !l.token.copycatOf).length;
  const overnight = "Overnight: " + plural(pulls, "liquidity pull") + ", " + plural(crashes, "crash", "crashes") + ", " + plural(bundled, "bundled launch", "bundled launches") + (clean ? ", " + plural(clean, "launch", "launches") + " graded A" : "") + ".";
  const day = new Date().toISOString().slice(0, 10);
  return { title: "gm ☀️ Your Strix morning brief", body: moves.length ? moves.join(" · ") + ". " + overnight : overnight, url: "/agent?q=%2Fbrief&source=push", tag: "brief-" + day };
}

export async function sendBriefTo(endpoint: string) {
  await load();
  const d = S.devices.get(deviceId(endpoint));
  if (!d) return { ok: false, reason: "not registered" };
  return { ok: await deliver(d, await buildBrief(d.watch ?? []), true) };
}

async function morningBriefs(devices: Device[]) {
  const now = new Date();
  if (now.getUTCHours() !== BRIEF_HOUR_UTC) return;
  const day = now.toISOString().slice(0, 10);
  for (const d of devices) {
    if (d.brief === false || d.briefDay === day || !S.devices.has(d.id)) continue;
    d.briefDay = day;
    await deliver(d, await buildBrief(d.watch ?? []), true);
    await save(d);
  }
}

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

    await morningBriefs(devices).catch(() => {});

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
