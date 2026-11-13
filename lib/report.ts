import { cached, peek } from "./cache";
import { analystReport } from "./analyst";
import { resolvePool, trusted, type Token } from "./rhchain";

/**
 * Public token reports (/t/[token]): one shared, cached analyst run per pool so the page,
 * its share card image and repeated visits don't recompute the checks.
 */

export type Report = Awaited<ReturnType<typeof analystReport>>;

export async function getReport(input: string): Promise<Report | null> {
  const key = decodeURIComponent(input).trim();
  if (!key || key.length > 80) return null;
  const pool = await resolvePool(key).catch(() => null);
  if (!pool) return null;
  return cached(`report:${pool.toLowerCase()}`, 120_000, () => analystReport(pool)).catch(() => null);
}

/** Short share URL: the symbol when it unambiguously means this token, otherwise its address. */
export function shareSlug(t: Token): string {
  const top = peek<Token[]>("rh:top") ?? [];
  const sameSymbol = top.filter((x) => x.symbol.toUpperCase() === t.symbol.toUpperCase());
  const original = sameSymbol.find((x) => trusted(x));
  const clean = /^[A-Za-z0-9]{1,15}$/.test(t.symbol);
  return clean && original && original.address.toLowerCase() === t.address.toLowerCase() ? t.symbol : t.address;
}

export const fmtUsd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "–" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(n >= 1 ? 2 : 0)}`;
export const fmtPrice = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "–" : n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : n >= 1 ? `$${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}` : `$${Number(n.toPrecision(4))}`;
export const fmtAge = (h: number | null | undefined) => (h == null ? "–" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);
export const gradeTone = (g: string) => (g === "A" || g === "B" ? "good" : g === "C" ? "mid" : "bad");
