/**
 * Vision step for the agent: a screenshot (tweet, Telegram shill, chart, wallet, explorer page) is read
 * once by a free Gemini model and turned into compact JSON — tokens, addresses, claims, numbers.
 * The agent then checks every item against live on-chain data with its normal tools, so the answer
 * never relies on the image alone.
 */

const PROMPT = `You are the vision step of Strix, a Robinhood Chain research agent.
Report ONLY what is visible in this image. Reply with compact JSON, no prose:
{"kind":"tweet | chat message | chart | wallet/portfolio | token page | explorer/contract | other",
 "summary":"one short sentence",
 "tokens":["token symbols or names as written, e.g. $PONS"],
 "addresses":["full 0x… addresses copied character by character"],
 "partialAddresses":["addresses that are cut off or unreadable, as far as visible"],
 "claims":["promises or claims, e.g. '100x soon', 'liquidity locked', 'safe', 'presale'"],
 "numbers":["prices, % changes, market caps, holder counts visible"]}
Never guess or complete anything that is not clearly visible.`;

export const visionEnabled = () => !!process.env.GEMINI_API_KEY;

export async function readImage(dataUrl: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Reading images needs a free GEMINI_API_KEY in .env.local");
  const models = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  let last: Error | null = null;
  for (const model of models) {
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 700,
          messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`vision ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (j.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      if (!text) throw new Error("vision returned nothing");
      return text.slice(0, 2500);
    } catch (e) {
      last = e as Error;
    }
  }
  throw last ?? new Error("vision failed");
}

/** Short human summary of the vision JSON for the step line. */
export function visionSummary(raw: string) {
  try {
    const j = JSON.parse(raw) as { kind?: string; tokens?: string[]; addresses?: string[]; claims?: string[] };
    const bits = [j.kind, j.tokens?.length ? `tokens: ${j.tokens.slice(0, 4).join(", ")}` : "", j.addresses?.length ? `${j.addresses.length} address${j.addresses.length > 1 ? "es" : ""}` : "", j.claims?.length ? `${j.claims.length} claim${j.claims.length > 1 ? "s" : ""}` : ""];
    return bits.filter(Boolean).join(" · ") || "read";
  } catch {
    return raw.slice(0, 80);
  }
}
