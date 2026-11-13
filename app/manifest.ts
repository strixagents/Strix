import type { MetadataRoute } from "next";

/** Makes Strix installable as an app (its own window and icon) on desktop and mobile. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Strix — the AI agent for Robinhood Chain",
    short_name: "Strix",
    description: "Ask anything about Robinhood Chain: safety scorecards, Contract X-ray, Rug Radar, whales and wallets — live data.",
    start_url: "/agent?source=app",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#050507",
    theme_color: "#050507",
    categories: ["finance", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask the agent", url: "/agent?source=app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Analyst", url: "/app?source=app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Rug Radar", url: "/radar?source=app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Wallet scanner", url: "/wallet?source=app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
