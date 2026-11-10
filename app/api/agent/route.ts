import { runAgent, llmEnabled, type AgentEvent } from "@/lib/agent";
import { rateLimit } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return Response.json({ llm: llmEnabled() });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`agent:${ip}`, 20, 10 * 60_000)) {
    return Response.json({ error: "Too many requests — try again in a few minutes." }, { status: 429 });
  }

  let body: { messages?: { role: string; content: string }[] };
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
        await runAgent(history, emit);
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
