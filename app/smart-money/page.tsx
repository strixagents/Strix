import type { Metadata } from "next";
import { SmartMoney } from "@/components/SmartMoney";

export const metadata: Metadata = {
  title: "Strix Smart Money — top Robinhood Chain traders (bots removed)",
  description: "Real wallets ranked by trading PnL on Robinhood Chain's most liquid tokens, with bots and relayers filtered out.",
};

export default function Page() {
  return <SmartMoney />;
}
