import type { Metadata } from "next";
import { MyStrix } from "@/components/MyStrix";

export const metadata: Metadata = {
  title: "My Strix — your watchlist, alerts and wallets",
  description: "Your Robinhood Chain watchlist with live prices and risk, price alerts and followed wallets in one place.",
};

export default function MePage() {
  return <MyStrix />;
}
