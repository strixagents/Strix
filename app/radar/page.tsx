import type { Metadata } from "next";
import { Radar } from "@/components/Radar";

export const metadata: Metadata = {
  title: "Strix Rug Radar — live liquidity pulls, crashes, mints & copycats on Robinhood Chain",
  description: "Live watch over Robinhood Chain pools for liquidity pulls, price crashes, sudden supply mints and copycat token launches.",
};

export default function Page() {
  return <Radar />;
}
