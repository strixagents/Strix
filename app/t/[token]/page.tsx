import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { ShareReport } from "@/components/ShareReport";
import { ReportChart, WatchButton } from "@/components/ReportTools";
import { HolderMap } from "@/components/HolderMap";
import { fmtAge, fmtPrice, fmtUsd, getReport, gradeTone, shareSlug } from "@/lib/report";
import { links } from "@/lib/rhchain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const r = await getReport(token);
  if (!r) return { title: "Token not found — Strix" };
  const { token: t, scorecard: sc } = r;
  const flags = sc.checks.filter((c) => c.status === "fail" || c.status === "warn").slice(0, 3).map((c) => c.label);
  const title = `$${t.symbol} safety check: ${sc.grade} (${sc.score}/100) — Strix`;
  const description = `${sc.verdict}.${flags.length ? ` Watch: ${flags.join(", ")}.` : " All automated checks passed."} Live on-chain report for ${t.name} on Robinhood Chain.`;
  return { title, description, openGraph: { title, description, url: `https://strixagents.com/t/${shareSlug(t)}` }, twitter: { title, description } };
}

const toneCls = { good: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", mid: "text-amber border-amber/30 bg-amber/10", bad: "text-rose-300 border-rose-400/30 bg-rose-400/10" } as const;
const barCls = { good: "bg-emerald-400", mid: "bg-amber", bad: "bg-rose-400" } as const;
const statusCls = { pass: "text-emerald-300", warn: "text-amber", fail: "text-rose-300", info: "text-zinc-400" } as const;
const statusIcon = { pass: "✓", warn: "!", fail: "✕", info: "i" } as const;

export default async function TokenReport({ params }: Props) {
  const { token } = await params;
  const r = await getReport(token);
  if (!r) notFound();
  const { token: t, info, scorecard: sc, contract } = r;
  const tone = gradeTone(sc.grade);
  const slug = shareSlug(t);
  const url = `https://strixagents.com/t/${slug}`;
  const shareText = `$${t.symbol} gets ${sc.grade} (${sc.score}/100) on the Strix safety check — ${sc.verdict.toLowerCase()}.`;
  const bad = sc.checks.filter((c) => c.status === "fail" || c.status === "warn");
  const rest = sc.checks.filter((c) => c.status !== "fail" && c.status !== "warn");
  const l = links(t);
  const checkedAt = new Date().toISOString().slice(11, 16);

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:pt-14">
        {/* token header */}
        <div className="flex flex-wrap items-center gap-4">
          {t.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image} alt="" width={56} height={56} className="h-14 w-14 rounded-full bg-white/5" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-xl font-semibold">{t.symbol.slice(0, 1)}</div>
          )}
          <div className="min-w-0">
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-amber">Strix safety report</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              ${t.symbol} <span className="text-lg font-normal text-muted sm:text-xl">{t.name}</span>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <WatchButton pool={t.pool} symbol={t.symbol} />
          <div className="text-right">
            <div className="font-mono text-2xl">{fmtPrice(t.price)}</div>
            <div className={`font-mono text-sm ${t.change.h24 >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{t.change.h24 >= 0 ? "+" : ""}{t.change.h24.toFixed(2)}% 24h</div>
          </div>
          </div>
        </div>

        {/* grade */}
        <section className="mt-8 rounded-2xl border border-line bg-white/[0.02] p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-6">
            <div className={`grid h-24 w-24 place-items-center rounded-3xl border text-6xl font-bold ${toneCls[tone]}`}>{sc.grade}</div>
            <div className="min-w-0">
              <div className="font-mono text-5xl font-medium tracking-tight">{sc.score}<span className="text-2xl text-muted">/100</span></div>
              <div className="mt-1 text-lg text-zinc-300">{sc.verdict}</div>
            </div>
          </div>
          <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${barCls[tone]}`} style={{ width: `${sc.score}%` }} /></div>
          {bad.length ? (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {bad.map((c) => (
                <div key={c.key} className={`rounded-xl border p-3.5 ${c.status === "fail" ? "border-rose-400/25 bg-rose-400/[0.05]" : "border-amber/25 bg-amber/[0.05]"}`}>
                  <div className="text-sm text-zinc-400">{c.label}</div>
                  <div className={`mt-0.5 ${statusCls[c.status]}`}>{c.detail}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-emerald-300">✓ Every automated check passed.</p>
          )}
          <ul className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {rest.map((c) => (
              <li key={c.key} className="flex gap-2.5">
                <span className={`font-mono ${statusCls[c.status]}`}>{statusIcon[c.status]}</span>
                <span className="text-zinc-400"><span className="text-zinc-200">{c.label}</span> — {c.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* live chart + price alerts */}
        <section className="mt-5">
          <ReportChart pool={t.pool} symbol={t.symbol} price={t.price} />
        </section>

        {/* holder bubble map */}
        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Holder bubble map</h2>
              <p className="text-sm text-muted">Top holders, with linked wallets grouped by color.</p>
            </div>
            <Link href={`/bubbles?token=${t.pool}`} className="text-sm text-muted hover:text-white">Full screen ↗</Link>
          </div>
          <HolderMap token={t.pool} />
        </section>

        {/* contract x-ray */}
        {contract && (
          <section className="mt-5 rounded-2xl border border-line bg-white/[0.02] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Contract X-ray</h2>
              <span className={`rounded-full border px-3 py-1 font-mono text-xs uppercase ${contract.verdict === "danger" ? "border-rose-400/40 text-rose-300" : contract.verdict === "caution" ? "border-amber/40 text-amber" : contract.verdict === "issuer" ? "border-sky-400/40 text-sky-300" : "border-emerald-400/40 text-emerald-300"}`}>{contract.verdict}</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {contract.findings.map((f) => (
                <li key={f.key} className="flex gap-2.5">
                  <span className={f.severity === "high" ? "text-rose-300" : f.severity === "medium" ? "text-amber" : "text-zinc-500"}>●</span>
                  <span className="text-zinc-400"><span className="text-zinc-200">{f.label}</span> — {f.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{contract.note}</p>
          </section>
        )}

        {/* stats */}
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Liquidity", fmtUsd(t.liquidity)],
            ["Volume 24h", fmtUsd(t.volume.h24)],
            ["FDV", fmtUsd(t.fdv)],
            ["Holders", info?.holders.count != null ? info.holders.count.toLocaleString("en-US") : "–"],
            ["Pool age", fmtAge(t.ageHours)],
            ["Top 10 hold", info?.holders.top10 != null ? `${info.holders.top10.toFixed(1)}%` : "–"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-white/[0.02] p-4">
              <div className="text-xs uppercase tracking-wider text-muted">{k}</div>
              <div className="mt-1 font-mono text-lg">{v}</div>
            </div>
          ))}
        </section>

        {/* share + actions */}
        <section className="mt-8 rounded-2xl border border-line bg-white/[0.02] p-6">
          <div className="text-sm text-muted">Share this report</div>
          <div className="mt-3"><ShareReport url={url} text={shareText} /></div>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <Link href={`/agent?q=${encodeURIComponent(`Is ${t.symbol} safe to hold?`)}`} className="btn-primary px-4 py-2">Ask the agent about ${t.symbol}</Link>
            <Link href={`/app?pool=${t.pool}`} className="btn-secondary px-4 py-2">Open in analyst</Link>
            <a href={l.explorer} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2 text-muted hover:text-white">Explorer ↗</a>
            <a href={l.dexscreener} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2 text-muted hover:text-white">DexScreener ↗</a>
          </div>
        </section>

        <p className="mt-6 font-mono text-xs text-muted">
          Contract {t.address} · pool {t.pool.slice(0, 10)}… · {t.dex} · checked live at {checkedAt} UTC
        </p>
        <p className="mt-2 text-xs text-muted">Automated checks are a warning system, not a guarantee. Research only — not financial advice.</p>
      </main>
    </div>
  );
}
