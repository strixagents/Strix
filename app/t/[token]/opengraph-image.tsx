import { ImageResponse } from "next/og";
import { fmtPrice, getReport, gradeTone, shareSlug } from "@/lib/report";

export const dynamic = "force-dynamic";
export const alt = "Strix safety report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Geist from Google Fonts (TTF), loaded once per server process; falls back to the default font. */
const fontCache = new Map<number, Promise<ArrayBuffer | null>>();
function geist(weight: number) {
  if (!fontCache.has(weight))
    fontCache.set(
      weight,
      (async () => {
        const css = await fetch(`https://fonts.googleapis.com/css2?family=Geist:wght@${weight}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text());
        const src = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
        return src ? fetch(src, { signal: AbortSignal.timeout(8000) }).then((r) => r.arrayBuffer()) : null;
      })().catch(() => null)
    );
  return fontCache.get(weight)!;
}

const COLORS = {
  good: { fg: "#6ee7b7", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.45)", glow: "rgba(52,211,153,0.25)" },
  mid: { fg: "#fcd34d", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.45)", glow: "rgba(251,191,36,0.22)" },
  bad: { fg: "#fda4af", bg: "rgba(251,113,133,0.12)", border: "rgba(251,113,133,0.45)", glow: "rgba(251,113,133,0.25)" },
};

function Mark({ s }: { s: number }) {
  const q = s * 0.52;
  return (
    <div style={{ position: "relative", width: s, height: s, display: "flex" }}>
      <div style={{ position: "absolute", left: s * 0.1, top: s * 0.12, width: q, height: q, borderRadius: q * 0.28, background: "#ff9f43" }} />
      <div style={{ position: "absolute", left: s * 0.38, top: s * 0.36, width: q, height: q, borderRadius: q * 0.28, background: "#7c5cff" }} />
      <div style={{ position: "absolute", left: s * 0.38, top: s * 0.36, width: q * 0.46, height: q * 0.54, borderRadius: `0 0 0 ${q * 0.28}px`, background: "#ffc2ff" }} />
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [r, f400, f600] = await Promise.all([getReport(token), geist(400), geist(600)]);
  const fonts = [f400 && { name: "Geist", data: f400, weight: 400 as const, style: "normal" as const }, f600 && { name: "Geist", data: f600, weight: 600 as const, style: "normal" as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[];

  if (!r) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 28, background: "#050507", color: "#f4f1ea", fontFamily: "Geist", fontSize: 72 }}>
        <Mark s={120} />
        <div>Strix</div>
      </div>,
      { ...size, fonts }
    );
  }
  const { token: t, scorecard: sc } = r;
  const c = COLORS[gradeTone(sc.grade)];
  const flags = sc.checks.filter((x) => x.status === "fail" || x.status === "warn").slice(0, 3);
  const sym = "$" + (t.symbol.length > 10 ? t.symbol.slice(0, 10) + "…" : t.symbol);
  const sub = (t.name.length > 32 ? t.name.slice(0, 32) + "…" : t.name) + " · " + fmtPrice(t.price);
  const slug = shareSlug(t);
  const foot = "strixagents.com/t/" + (slug.length > 20 ? slug.slice(0, 10) + "…" + slug.slice(-6) : slug);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 64px", fontFamily: "Geist", color: "#f4f1ea",
        backgroundColor: "#050507", backgroundImage: `radial-gradient(circle at 12% 0%, rgba(255,159,67,0.22), transparent 45%), radial-gradient(circle at 92% 100%, rgba(124,92,255,0.25), transparent 50%), radial-gradient(circle at 80% 40%, ${c.glow}, transparent 40%)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark s={48} />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>Strix</div>
          <div style={{ display: "flex", marginLeft: 14, fontSize: 18, letterSpacing: 5, color: "#ff9f43" }}>SAFETY REPORT</div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", marginTop: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 104, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>{sym}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa", marginTop: 14 }}>{sub}</div>
            <div style={{ display: "flex", fontSize: 32, marginTop: 30, color: "#e4e4e7" }}>{sc.verdict}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              {flags.length ? (
                flags.map((x) => (
                  <div key={x.key} style={{ display: "flex", fontSize: 21, padding: "7px 16px", borderRadius: 999, border: `1px solid ${x.status === "fail" ? "rgba(251,113,133,0.5)" : "rgba(251,191,36,0.5)"}`, color: x.status === "fail" ? "#fda4af" : "#fcd34d" }}>
                    {(x.status === "fail" ? "× " : "! ") + x.label}
                  </div>
                ))
              ) : (
                <div style={{ display: "flex", fontSize: 21, padding: "7px 16px", borderRadius: 999, border: "1px solid rgba(52,211,153,0.5)", color: "#6ee7b7" }}>All automated checks passed</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginLeft: 40 }}>
            <div style={{ width: 250, height: 250, borderRadius: 56, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 170, fontWeight: 600, color: c.fg, background: c.bg, border: `3px solid ${c.border}` }}>{sc.grade}</div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 18 }}>
              <div style={{ display: "flex", fontSize: 56, fontWeight: 600 }}>{sc.score}</div>
              <div style={{ display: "flex", fontSize: 30, color: "#71717a" }}>/100</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#71717a" }}>
          <div>{foot}</div>
          <div>Live on-chain data · Robinhood Chain</div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
