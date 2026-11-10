import type { Metadata } from "next";
import { Suspense } from "react";
import { Terminal } from "@/components/terminal/Terminal";

export const metadata: Metadata = {
  title: "Strix Analyst — live charts, safety checks & the AI agent",
};

export default function AppPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-muted">Loading analyst…</div>}>
      <Terminal />
    </Suspense>
  );
}
