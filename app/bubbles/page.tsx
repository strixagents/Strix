import type { Metadata } from "next";
import { BubblesPage } from "@/components/BubblesPage";

export const metadata: Metadata = {
  title: "Bubble Map — who really holds a token · Strix",
  description: "Top holders of any Robinhood Chain token as bubbles, with linked wallets grouped: shared funding, wallet-to-wallet transfers and bundled buys.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <BubblesPage token={token?.trim() || null} />;
}
