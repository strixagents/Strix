import type { Metadata } from "next";
import { AgentPage } from "@/components/AgentPage";

export const metadata: Metadata = {
  title: "Strix Agent — the AI agent for Robinhood Chain",
  description: "Ask anything about Robinhood Chain. Strix runs live on-chain tools — safety scorecard, whales, wallets, Rug Radar — and explains what it finds. Also available as a CLI and MCP server.",
};

export default function Page() {
  return <AgentPage />;
}
