import type { Metadata } from "next";
import { Suspense } from "react";
import { WalletPage } from "@/components/WalletPage";

export const metadata: Metadata = {
  title: "Strix Wallet — portfolio risk & smart-money tracker for Robinhood Chain",
  description: "Scan any Robinhood Chain wallet: live holdings with risk grades, fake airdrops filtered, and 24h buys and sells.",
};

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-muted">Loading…</div>}>
      <WalletPage />
    </Suspense>
  );
}
