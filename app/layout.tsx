import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AlertWatcher } from "@/components/AlertWatcher";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-display",
});

export const metadata: Metadata = {
  title: "Strix — the AI agent for Robinhood Chain",
  description:
    "An on-chain AI agent with a built-in analyst for Robinhood Chain (chain 4663): rug-risk checks, whale and wallet tracking, Rug Radar and live charts — in the browser, the CLI and any MCP client. Free.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${serif.variable}`}>
      <body className="font-sans">
        {children}
        <AlertWatcher />
      </body>
    </html>
  );
}
