import type { Metadata } from "next";
import { Suspense } from "react";
import { Terminal } from "@/components/terminal/Terminal";

export const metadata: Metadata = {
  title: "Strix Terminal — live charts & AI trading analyst",
};

export default function AppPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-muted">Loading terminal…</div>}>
      <Terminal />
    </Suspense>
  );
}
