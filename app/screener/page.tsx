import type { Metadata } from "next";
import { Screener } from "@/components/Screener";

export const metadata: Metadata = {
  title: "Strix Screener — Robinhood Chain tokens with signals & risk scores",
};

export default function ScreenerPage() {
  return <Screener />;
}
