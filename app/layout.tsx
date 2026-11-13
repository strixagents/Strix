import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AlertWatcher } from "@/components/AlertWatcher";
import { PwaRegister } from "@/components/InstallApp";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-display",
});

const SITE_DESCRIPTION =
  "An on-chain AI agent for Robinhood Chain: safety scorecards, Contract X-ray, Rug Radar, whale and wallet tracking — live data, in the browser, the CLI and any MCP client.";

export const metadata: Metadata = {
  metadataBase: new URL("https://strixagents.com"),
  title: "Strix — the AI agent for Robinhood Chain",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Strix",
    url: "https://strixagents.com",
    title: "Strix — the AI agent for Robinhood Chain",
    description: SITE_DESCRIPTION,
  },
  applicationName: "Strix",
  appleWebApp: { capable: true, title: "Strix", statusBarStyle: "black-translucent" },
  twitter: {
    card: "summary_large_image",
    site: "@strix_agents",
    creator: "@strix_agents",
    title: "Strix — the AI agent for Robinhood Chain",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = { themeColor: "#050507" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${serif.variable}`}>
      <body className="font-sans">
        {children}
        <AlertWatcher />
        <PwaRegister />
      </body>
    </html>
  );
}
