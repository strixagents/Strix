import type { MetadataRoute } from "next";

const PAGES: [string, number][] = [
  ["", 1],
  ["/agent", 0.9],
  ["/docs", 0.8],
  ["/app", 0.8],
  ["/radar", 0.7],
  ["/smart-money", 0.6],
  ["/screener", 0.6],
  ["/stocks", 0.6],
  ["/wallet", 0.6],
  ["/terms", 0.3],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority]) => ({
    url: `https://strixagents.com${path}`,
    lastModified: new Date(),
    changeFrequency: path === "/radar" ? "hourly" : "daily",
    priority,
  }));
}
