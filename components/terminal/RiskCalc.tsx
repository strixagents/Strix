"use client";

import { useEffect, useState } from "react";
import { fmtPrice } from "../market-ui";

const load = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-line bg-ink/60 px-2.5 focus-within:border-amber/40">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          className="w-full bg-transparent py-1.5 font-mono text-sm outline-none"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </label>
  );
}

export function RiskCalc({
  price, defaultStop, defaultTarget, currency,
}: { price: number; defaultStop?: number; defaultTarget?: number; currency: string }) {
  const [balance, setBalance] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState(String(+price.toPrecision(6)));
  const [stop, setStop] = useState(defaultStop ? String(+defaultStop.toPrecision(6)) : "");
  const [target, setTarget] = useState(defaultTarget ? String(+defaultTarget.toPrecision(6)) : "");

  useEffect(() => {
    setBalance(load("strix.balance", "1000"));
    setRiskPct(load("strix.riskPct", "1"));
  }, []);

  const b = parseFloat(balance), r = parseFloat(riskPct), e = parseFloat(entry), s = parseFloat(stop), t = parseFloat(target);
  const valid = b > 0 && r > 0 && e > 0 && s > 0 && e !== s;
  const riskAmt = valid ? (b * r) / 100 : 0;
  const perUnit = valid ? Math.abs(e - s) : 0;
  const qty = valid ? riskAmt / perUnit : 0;
  const posValue = qty * e;
  const side = valid ? (s < e ? "Long" : "Short") : "–";
  const rr = valid && t > 0 ? Math.abs(t - e) / perUnit : null;
  const isIDR = currency === "IDR";
  const lots = isIDR ? Math.floor(qty / 100) : null;
  const ccy = currency || "";

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-muted">Position size calculator</div>
        <span className={`rounded-md px-2 py-0.5 text-xs ${side === "Long" ? "bg-emerald-400/10 text-emerald-300" : side === "Short" ? "bg-rose-400/10 text-rose-300" : "text-muted"}`}>
          {side}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Account" value={balance} onChange={(v) => { setBalance(v); save("strix.balance", v); }} suffix={ccy} />
        <Field label="Risk per trade" value={riskPct} onChange={(v) => { setRiskPct(v); save("strix.riskPct", v); }} suffix="%" />
        <Field label="Entry" value={entry} onChange={setEntry} />
        <Field label="Stop loss" value={stop} onChange={setStop} />
        <div className="col-span-2">
          <Field label="Target (optional)" value={target} onChange={setTarget} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
        <div className="rounded-lg bg-white/[0.03] p-2.5">
          <div className="text-[11px] text-muted">Max loss</div>
          <div className="text-rose-300">{valid ? `${fmtPrice(riskAmt)} ${ccy}` : "–"}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-2.5">
          <div className="text-[11px] text-muted">{isIDR ? "Size (lot)" : "Size (units)"}</div>
          <div className="text-white">{valid ? (isIDR ? `${lots} lot` : fmtPrice(qty)) : "–"}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-2.5">
          <div className="text-[11px] text-muted">Position value</div>
          <div className="text-white">{valid ? `${fmtPrice(isIDR ? (lots ?? 0) * 100 * e : posValue)} ${ccy}` : "–"}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] p-2.5">
          <div className="text-[11px] text-muted">Reward : risk</div>
          <div className={rr == null ? "text-muted" : rr >= 2 ? "text-emerald-300" : rr >= 1 ? "text-amber" : "text-rose-300"}>
            {rr == null ? "–" : `${rr.toFixed(2)}R`}
          </div>
        </div>
      </div>
      {valid && posValue > b && !isIDR && (
        <p className="mt-2 text-[11px] text-amber">Needs ~{(posValue / b).toFixed(1)}× leverage for this size.</p>
      )}
      {isIDR && valid && lots === 0 && <p className="mt-2 text-[11px] text-amber">Risk too small for 1 lot (100 shares) at this stop.</p>}
    </div>
  );
}
