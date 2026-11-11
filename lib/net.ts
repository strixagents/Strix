import https from "node:https";
import type { LookupFunction } from "node:net";

/**
 * POST JSON to the chain RPC in a way that survives DNS hijacking.
 *
 * Some ISPs (e.g. Indonesian "Internet Positif" filtering) intercept DNS — even queries sent to 1.1.1.1 —
 * and point crypto domains at a block page, so TLS fails with "certificate expired" and every on-chain
 * call breaks. When the normal request fails at the network level, we resolve the host over
 * DNS-over-HTTPS (Cloudflare, then Google) and connect straight to the real IP, keeping the hostname
 * for TLS/SNI so the certificate is still fully verified. Once DoH was needed it is used directly for
 * a while, so we don't pay for a failing attempt on every call.
 */

type Res = { status: number; json: () => Promise<unknown> };
type State = { dohUntil: number; ips: Map<string, { ips: string[]; until: number }> };
const G = globalThis as unknown as { __strixNet?: State };
const S: State = (G.__strixNet ??= { dohUntil: 0, ips: new Map() });

async function dohResolve(host: string): Promise<string[]> {
  const hit = S.ips.get(host);
  if (hit && hit.until > Date.now()) return hit.ips;
  const urls = [
    `https://cloudflare-dns.com/dns-query?name=${host}&type=A`,
    `https://dns.google/resolve?name=${host}&type=A`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5_000), cache: "no-store" });
      const j = (await r.json()) as { Answer?: { type: number; data: string; TTL: number }[] };
      const a = (j.Answer ?? []).filter((x) => x.type === 1);
      if (a.length) {
        const ttl = Math.min(600, Math.max(60, Math.min(...a.map((x) => x.TTL))));
        const ips = a.map((x) => x.data);
        S.ips.set(host, { ips, until: Date.now() + ttl * 1000 });
        return ips;
      }
    } catch {}
  }
  throw new Error(`Could not resolve ${host} over DNS-over-HTTPS`);
}

function postVia(url: string, body: string, timeout: number, ip: string): Promise<Res> {
  const u = new URL(url);
  const lookup: LookupFunction = (_host, opts, cb) => {
    if (typeof opts === "object" && opts && "all" in opts && opts.all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: ip, family: 4 }]);
    else cb(null, ip, 4);
  };
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: u.hostname, servername: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "POST", lookup, timeout,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, json: async () => JSON.parse(text) });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("RPC timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

async function postDoh(url: string, body: string, timeout: number): Promise<Res> {
  const ips = await dohResolve(new URL(url).hostname);
  let last: unknown;
  for (const ip of ips) {
    try {
      return await postVia(url, body, timeout, ip);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("RPC unreachable");
}

export async function postJson(url: string, body: string, timeout = 15_000): Promise<Res> {
  if (S.dohUntil > Date.now()) return postDoh(url, body, timeout);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: AbortSignal.timeout(timeout) });
    return { status: r.status, json: () => r.json() };
  } catch (e) {
    // a timeout is not a DNS problem — don't switch modes for it
    if ((e as Error).name === "TimeoutError") throw e;
    const r = await postDoh(url, body, timeout);
    S.dohUntil = Date.now() + 30 * 60_000;
    return r;
  }
}
