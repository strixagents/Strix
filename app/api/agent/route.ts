import { TOOLS, runAgent, llmEnabled, type AgentCtx, type AgentEvent } from "@/lib/agent";

const ADDR = /^0x[0-9a-fA-F]{40,64}$/;
const clean = (s: unknown, n = 30) => (typeof s === "string" ? s.replace(/[^\w.$ -]/g, "").slice(0, n) : "");
/** The browser sends the user's own watchlist / wallets / alerts — validate and cap everything. */
function readCtx(body: Record<string, unknown>): AgentCtx {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    viewing: clean(body.viewing) || undefined,
    web: body.client === "web",
    watchlist: arr(body.watchlist).filter((w) => ADDR.test(w?.pool)).slice(0, 10).map((w) => ({ pool: w.pool, symbol: clean(w.symbol, 20) })),
    wallets: arr(body.wallets).filter((w) => /^0x[0-9a-fA-F]{40}$/.test(w?.address)).slice(0, 10).map((w) => ({ address: w.address, label: clean(w.label, 40) })),
    image:
      typeof body.image === "string" && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image) && body.image.length < 3_500_000 ? body.image : undefined,
    alerts: arr(body.alerts)
      .filter((a) => ADDR.test(a?.pool) && Number(a?.price) > 0)
      .slice(0, 15)
      .map((a) => ({ pool: a.pool, symbol: clean(a.symbol, 20), price: Number(a.price), dir: a.dir === "above" ? "above" : "below" })),
  };
}
import { rateLimit } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json({ llm: llmEnabled(), tools: TOOLS.length });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`agent:${ip}`, 20, 10 * 60_000)) {
    return Response.json({ error: "Too many requests — try again in a few minutes." }, { status: 429 });
  }

  let body: { messages?: { role: string; content: string }[] } & Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }))
    .slice(-10);
  if (!history.length || history.at(-1)!.role !== "user") {
    return Response.json({ error: "Last message must be from user" }, { status: 400 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // late timers (e.g. the "AI is busy" countdown) may fire after we closed — ignore them instead of throwing
      let closed = false;
      const emit = (e: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        const ctx = readCtx(body);
        // screenshots use the free Gemini vision quota — cap them separately; the question is still answered without the image
        if (ctx.image && !rateLimit(`vision:${ip}`, 6, 10 * 60_000)) {
          ctx.image = undefined;
          emit({ t: "step", id: "vlimit", name: "read_image", label: "Image limit reached (6 per 10 minutes) — answering without the screenshot" });
          emit({ t: "step_done", id: "vlimit", ok: false, summary: "try the screenshot again in a few minutes" });
        }
        await runAgent(history, emit, ctx);
      } catch (e) {
        emit({ t: "error", message: (e as Error).message });
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      // client went away (tab closed / navigated) — nothing else to do, emit() becomes a no-op
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
