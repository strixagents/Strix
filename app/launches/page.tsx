import type { Metadata } from "next";
import { LaunchesPage } from "@/components/LaunchesPage";

export const metadata: Metadata = {
  title: "Launch Scanner — every new Robinhood Chain token, checked live · Strix",
  description: "Every token launched on Robinhood Chain in the last 24 hours with an early grade: contract admin powers, first-minute snipers and bundles, copycats, fake liquidity and spoofed volume.",
};

export default function Page() {
  return <LaunchesPage />;
}
