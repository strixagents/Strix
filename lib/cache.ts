// In-memory caches so we stay inside free API limits.
type Entry = { value: unknown; at: number };
// Shared via globalThis: Next.js may load this module once per route bundle.
const G = globalThis as unknown as { __strix?: { store: Map<string, Entry>; inflight: Map<string, Promise<unknown>>; hits: Map<string, { count: number; reset: number }> } };
G.__strix ??= { store: new Map(), inflight: new Map(), hits: new Map() };
const { store, inflight } = G.__strix;

function run<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const p = fn()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Plain TTL cache. */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  return run(key, fn);
}

/**
 * Stale-while-revalidate: fresh → return; stale → return stale now and refresh in background;
 * nothing cached → wait for fetch. If a refresh fails, the stale value keeps being served.
 */
export async function swr<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit) {
    if (Date.now() - hit.at >= ttlMs) run(key, fn).catch(() => {});
    return hit.value as T;
  }
  return run(key, fn);
}

// Simple fixed-window rate limiter per key (e.g. IP).
const { hits } = G.__strix;
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  h.count++;
  return h.count <= limit;
}

/** Read a cached value without triggering a fetch. */
export function peek<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

/** Write a value directly. `at` = 0 stores it as already stale (served now, refreshed on next read). */
export function put<T>(key: string, value: T, at = Date.now()) {
  store.set(key, { value, at });
}
