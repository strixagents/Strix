import { CHAIN } from "./rhchain";
import { postJson } from "./net";

/* Minimal EVM helpers for Robinhood Chain — no external libraries. */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const BLOCK_MS = 104; // measured average block time on chain 4663

export async function rpc<T>(method: string, params: unknown[], timeout = 15_000): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await postJson(CHAIN.rpc, JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), timeout);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    const j = (await res.json()) as { result?: T; error?: { message: string; code?: number } };
    if (j.error) {
      if (j.error.code === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw new Error(j.error.message);
    }
    return j.result as T;
  }
  throw new Error("RPC rate-limited — try again shortly");
}

/** JSON-RPC batch, sent in small groups (the public RPC rejects big batches). */
export async function rpcBatch<T>(calls: { method: string; params: unknown[] }[], group = 12): Promise<(T | null)[]> {
  const out: (T | null)[] = new Array(calls.length).fill(null);
  for (let i = 0; i < calls.length; i += group) {
    const slice = calls.slice(i, i + group);
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await postJson(CHAIN.rpc, JSON.stringify(slice.map((c, k) => ({ jsonrpc: "2.0", id: i + k, method: c.method, params: c.params }))), 20_000);
      const j = await res.json().catch(() => null);
      if (res.status === 429 || !Array.isArray(j)) {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
        continue;
      }
      for (const r of j as { id: number; result?: T }[]) out[r.id] = r.result ?? null;
      break;
    }
    if (i + group < calls.length) await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

const strip = (h: string) => (h.startsWith("0x") ? h.slice(2) : h);
const word = (hex: string) => strip(hex).padStart(64, "0");
const pad32 = (hexBytes: string) => {
  const h = strip(hexBytes);
  return h + "0".repeat((64 - (h.length % 64)) % 64);
};

/**
 * Multicall3.aggregate3 — many read-only calls in ONE eth_call.
 * Returns each call's raw return data (or null when that call failed).
 */
export async function multicall(calls: { target: string; data: string }[]): Promise<(string | null)[]> {
  if (!calls.length) return [];
  const results: (string | null)[] = [];
  for (let s = 0; s < calls.length; s += 150) {
    const chunk = calls.slice(s, s + 150);
    const n = chunk.length;
    // encode aggregate3((address,bool,bytes)[])
    const tuples = chunk.map((c) => {
      const data = strip(c.data);
      return word(c.target) + word("1") + word((96).toString(16)) + word((data.length / 2).toString(16)) + pad32(data);
    });
    let offsets = "";
    let acc = n * 32;
    for (const t of tuples) {
      offsets += word(acc.toString(16));
      acc += t.length / 2;
    }
    const calldata = "0x82ad56cb" + word("20") + word(n.toString(16)) + offsets + tuples.join("");
    const ret = strip(await rpc<string>("eth_call", [{ to: MULTICALL3, data: calldata }, "latest"]));
    // decode (bool,bytes)[]
    const at = (byteOffset: number) => parseInt(ret.slice(byteOffset * 2, byteOffset * 2 + 64), 16);
    const arr = at(0);
    const len = at(arr);
    const base = arr + 32;
    for (let i = 0; i < len; i++) {
      const tup = base + at(base + i * 32);
      const ok = at(tup) === 1;
      const bOff = tup + at(tup + 32);
      const bLen = at(bOff);
      results.push(ok ? "0x" + ret.slice((bOff + 32) * 2, (bOff + 32 + bLen) * 2) : null);
    }
  }
  return results;
}

export const addrWord = (a: string) => word(a.toLowerCase());
export const sel = { balanceOf: "0x70a08231", decimals: "0x313ce567" };
export const toBig = (hex: string | null) => {
  try {
    return hex && hex !== "0x" ? BigInt(hex) : 0n;
  } catch {
    return 0n;
  }
};
/** bigint token amount → number with decimals applied (safe for display/valuation). */
export const units = (v: bigint, decimals: number) => {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const d = 10n ** BigInt(decimals);
  const n = Number(a / d) + Number(a % d) / Number(d);
  return neg ? -n : n;
};
export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

/** Transactions ever sent by each address (nonce) — tells humans from bots/relayers. */
export async function txCounts(addresses: string[]): Promise<Map<string, number>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const r = await rpcBatch<string>(uniq.map((a) => ({ method: "eth_getTransactionCount", params: [a, "latest"] })), 12);
  return new Map(uniq.map((a, i) => [a, r[i] ? parseInt(r[i] as string, 16) : 0]));
}

/** More than this many sent transactions is not a person clicking buttons — it's an automated bot or an order relayer. */
export const BOT_TX_COUNT = 50_000;
