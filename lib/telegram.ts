import { rateLimit } from "./cache";
import { analystReport } from "./analyst";
import { getLaunches } from "./launches";
import { getRadar } from "./radar";
import { resolvePool } from "./rhchain";
import { shareSlug, fmtPrice, fmtUsd } from "./report";
import { runAgent } from "./agent";

/**
 * Strix on Telegram. Paste a contract address in any chat (or a group the bot is in) and it replies
 * with the safety grade, red flags, Contract X-ray and — for fresh tokens — the launch check, plus a
 * link to the shareable report. Commands: /safe /launches /radar /ask /help.
 * Replies are HTML (Telegram parse_mode=HTML).
 */

type TgUser = { id: number; is_bot?: boolean };
type TgChat = { id: number; type: "private" | "group" | "supergroup" | "channel" };
type TgMessage = { message_id: number; chat: TgChat; from?: TgUser; text?: string; caption?: string };
export type TgUpdate = { update_id: number; message?: TgMessage; channel_post?: TgMessage };

const SITE = "https://strixagents.com";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ADDR = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;
const gradeIcon = (g: string) => (g === "A" || g === "B" ? "🟢" : g === "C" ? "🟡" : "🔴");

export const telegramConfigured = () => !!process.env.TELEGRAM_BOT_TOKEN;

export async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return res ? res.json().catch(() => null) : null;
}

/** Safety summary for one token, with the launch check when it launched in the last 24h. */
async function tokenReply(input: string): Promise<string> {
  const pool = await resolvePool(input).catch(() => null);
  if (!pool) return `I couldn't find a Robinhood Chain token for <code>${esc(input)}</code>.`;
  const r = await analystReport(pool).catch(() => null);
  if (!r) return `I couldn't read <code>${esc(input)}</code> right now — try again in a minute.`;
  const { token: t, scorecard: sc, contract, info } = r;
  const flags = sc.checks.filter((c) => c.status === "fail" || c.status === "warn").slice(0, 4);
  const lines = [
    `${gradeIcon(sc.grade)} <b>$${esc(t.symbol)}</b> — <b>${sc.grade}</b> (${sc.score}/100)`,
    `<i>${esc(sc.verdict)}</i>`,
    "",
    `💲 ${fmtPrice(t.price)} · 24h ${t.change.h24 >= 0 ? "+" : ""}${t.change.h24.toFixed(1)}%`,
    `💧 Liquidity ${fmtUsd(t.liquidity)} · 👥 ${info?.holders.count != null ? info.holders.count.toLocaleString("en-US") : "–"} holders`,
  ];
  if (contract) lines.push(`🔬 Contract X-ray: <b>${contract.verdict.toUpperCase()}</b>${contract.findings[0] ? ` — ${esc(contract.findings[0].label)}` : ""}`);
  if (flags.length) {
    lines.push("", "<b>Red flags</b>");
    for (const f of flags) lines.push(`${f.status === "fail" ? "✕" : "!"} ${esc(f.label)}: ${esc(f.detail)}`);
  } else lines.push("", "✓ Every automated check passed");
  // fresh launches get the first-minute / developer / sell-test view too
  if ((t.ageHours ?? 99) <= 24) {
    const l = (await getLaunches().catch(() => null))?.launches.find((x) => x.token.address.toLowerCase() === t.address.toLowerCase());
    if (l) {
      lines.push("", `<b>Launch check: ${l.grade}</b> (${l.score}/100)`);
      if (l.snipers) lines.push(`⏱ First minute: ${l.snipers.buyers} wallets took ${l.snipers.sharePct.toFixed(0)}% of supply`);
      if (l.dev) lines.push(`🕵️ Dev holds ${l.dev.holdingPct.toFixed(1)}% · moved ${l.dev.movedPct.toFixed(1)}%`);
      if (l.sellable != null) lines.push(l.sellable ? "✓ Sell test passed" : "✕ Sell test FAILED — possible honeypot");
    }
  }
  lines.push("", `📄 <a href="${SITE}/t/${encodeURIComponent(shareSlug(t))}">Full report</a> · <code>${t.address}</code>`, "<i>Research only — not financial advice.</i>");
  return lines.join("\n");
}

async function launchesReply(): Promise<string> {
  const { launches } = await getLaunches();
  const bundled = launches.filter((l) => l.reasons.some((r) => r.text.startsWith("Bundled launch"))).length;
  const rows = launches.slice(0, 8).map((l) => {
    const why = l.reasons.find((r) => r.tone !== "good")?.text ?? l.reasons[0]?.text ?? "";
    return `${gradeIcon(l.grade)} <b>${l.grade}</b> <a href="${SITE}/t/${l.token.pool}">$${esc(l.token.symbol)}</a> · ${Math.round((l.token.ageHours ?? 0) * 60)}m · ${esc(why)}`;
  });
  return [`🚀 <b>Launch Scanner</b> — ${launches.length} launches in 24h, <b>${bundled} bundled</b>`, "", ...rows, "", `<a href="${SITE}/launches">See every launch →</a>`].join("\n");
}

async function radarReply(): Promise<string> {
  const r = await getRadar();
  const ev = r.events.filter((e) => e.severity === "high").slice(0, 6);
  if (!ev.length) return "🛡 Rug Radar: no high-severity events right now.";
  const rows = ev.map((e) => `🚨 <b>$${esc(e.symbol)}</b> — ${esc(e.title)} · ${Math.max(1, Math.round((Date.now() - e.at) / 60000))}m ago`);
  return [`🛰 <b>Rug Radar</b> — watching ${r.watching} pools`, "", ...rows, "", `<a href="${SITE}/radar">Open the radar →</a>`].join("\n");
}

async function askReply(question: string): Promise<string> {
  let answer = "";
  await runAgent([{ role: "user", content: question.slice(0, 500) }], (e) => {
    if (e.t === "answer") answer = e.text;
  }, { web: false });
  const plain = answer.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)");
  return esc(plain.slice(0, 3500)) + (plain.length > 3500 ? "…" : "");
}

const HELP = [
  "🦉 <b>Strix</b> — the AI agent for Robinhood Chain",
  "",
  "Paste any token contract address and I'll check it: safety grade, red flags, Contract X-ray and, for new tokens, bundles, the developer and a sell test.",
  "",
  "/safe &lt;symbol or address&gt; — safety check",
  "/launches — newest launches, graded",
  "/radar — latest rug alerts",
  "/ask &lt;question&gt; — ask the Strix agent",
  "",
  `Add me to a group and I'll check every contract address people paste. ${SITE}`,
].join("\n");

/** Turn one Telegram update into a reply (null = stay quiet). */
export async function replyFor(u: TgUpdate): Promise<{ chatId: number; replyTo: number; html: string } | null> {
  const m = u.message ?? u.channel_post;
  const text = (m?.text ?? m?.caption ?? "").trim();
  if (!m || !text || m.from?.is_bot) return null;
  const group = m.chat.type !== "private";
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/);
  const ca = text.match(ADDR)?.[0];
  if (!cmd && !ca && group) return null; // in groups: only commands and pasted addresses
  if (!rateLimit(`tg:${m.chat.id}`, group ? 30 : 20, 10 * 60_000)) return { chatId: m.chat.id, replyTo: m.message_id, html: "Slow down a little — try again in a few minutes." };

  let html: string;
  if (cmd) {
    const [, name, arg] = cmd;
    const a = arg.trim();
    if (name === "start" || name === "help") html = HELP;
    else if (name === "safe" || name === "check") html = a ? await tokenReply(a) : "Send <code>/safe PONS</code> or <code>/safe 0x…</code>.";
    else if (name === "launches" || name === "new") html = await launchesReply();
    else if (name === "radar") html = await radarReply();
    else if (name === "ask") html = a ? await askReply(a) : "Ask me anything: <code>/ask is PONS safe?</code>";
    else if (group) return null;
    else html = HELP;
  } else if (ca) html = await tokenReply(ca);
  else html = await askReply(text); // private chat: free text goes to the agent
  return { chatId: m.chat.id, replyTo: m.message_id, html };
}

export async function handleUpdate(u: TgUpdate) {
  const r = await replyFor(u);
  if (!r) return;
  await tg("sendMessage", { chat_id: r.chatId, text: r.html, parse_mode: "HTML", reply_parameters: { message_id: r.replyTo, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } });
}
