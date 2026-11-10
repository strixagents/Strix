import { TOOLS, runTool } from "@/lib/agent";
import { rateLimit } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Machine-friendly access to the same tools the AI agent uses (for the CLI and the MCP server).
// GET  /api/tool            → list tools with their JSON schemas
// POST /api/tool {name,args} → run one tool, returns { summary, data }
export async function GET() {
  return Response.json({ tools: TOOLS.map((t) => t.function) });
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`tool:${ip}`, 60, 60_000)) return Response.json({ error: "Too many requests — slow down a little." }, { status: 429 });
  let body: { name?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "");
  if (!TOOLS.some((t) => t.function.name === name)) return Response.json({ error: `Unknown tool "${name}"` }, { status: 400 });
  try {
    const r = await runTool(name, body.args ?? {});
    return Response.json({ summary: r.summary, data: r.data });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
