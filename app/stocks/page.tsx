import type { Metadata } from "next";
import { Stocks } from "@/components/Stocks";

export const metadata: Metadata = {
  title: "Strix Stocks — Robinhood stock token premium vs the real share",
  description: "Live premium/discount of official Robinhood stock tokens on Robinhood Chain versus the real stock price.",
};

export default function StocksPage() {
  return <Stocks />;
}
