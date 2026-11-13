import type { MetadataRoute } from "next";
import { getTopTokens, trusted } from "@/lib/rhchain";
import { shareSlug } from "@/lib/report";

export const revalidate = 3600;

const PAGES: [string, number][] = [
  ["", 1],
  ["/agent", 0.9],
  ["/docs", 0.8],
  ["/download", 0.7],
  ["/app", 0.8],
  ["/launches", 0.7],
  ["/radar", 0.7],
  ["/smart-money", 0.6],
  ["/screener", 0.6],
  ["/stocks", 0.6],
  ["/wallet", 0.6],
  ["/terms", 0.3],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = PAGES.map(([path, priority]) => ({
    url: `https://strixagents.com${path}`,
    lastModified: now,
    changeFrequency: path === "/radar" ? "hourly" : "daily",
    priority,
  }));
  // a public safety report for each of the most traded real tokens
  const top = await getTopTokens().catch(() => []);
  const reports = top
    .filter(trusted)
    .slice(0, 25)
    .map((t) => ({ url: `https://strixagents.com/t/${encodeURIComponent(shareSlug(t))}`, lastModified: now, changeFrequency: "hourly" as const, priority: 0.5 }));
  return [...pages, ...reports];
}
