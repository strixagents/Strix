import { handleUpdate, replyFor, telegramConfigured, type TgUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Telegram webhook. Telegram signs each call with the secret set at setWebhook time
 * (X-Telegram-Bot-Api-Secret-Token). Without a bot token configured, a local request with
 * ?dry=1 returns the reply instead of sending it (for testing).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return Response.json({ ok: false }, { status: 400 });
  const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url.searchParams.get("dry") === "1" && local) return Response.json(await replyFor(update));
  if (!telegramConfigured()) return Response.json({ ok: false, error: "bot not configured" }, { status: 503 });
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) return Response.json({ ok: false }, { status: 401 });
  // answer Telegram quickly; the reply is sent from the same request
  await handleUpdate(update).catch(() => {});
  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ configured: telegramConfigured() });
}
