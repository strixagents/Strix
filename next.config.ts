import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a production build go to its own folder (NEXT_DIST_DIR=.next-prod) without touching the dev server's cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
};

export default nextConfig;
