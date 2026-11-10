import type { Candle } from "./rhchain";

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(values, fast);
  const es = ema(values, slow);
  const line = values.map((_, i) => (ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null));
  const firstIdx = line.findIndex((v) => v != null);
  const sig: (number | null)[] = new Array(values.length).fill(null);
  if (firstIdx >= 0) {
    const sub = ema(line.slice(firstIdx) as number[], signal);
    sub.forEach((v, i) => (sig[firstIdx + i] = v));
  }
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i]! : null));
  return { line, signal: sig, hist };
}

export function atr(c: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(c.length).fill(null);
  if (c.length <= period) return out;
  const tr = c.map((x, i) =>
    i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))
  );
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < c.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const n = values.length;
  if (n < period) return null;
  const slice = values.slice(n - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd };
}

/** Swing-pivot based support/resistance, clustered. */
export function levels(c: Candle[], lookback = 150, wing = 3) {
  const data = c.slice(-lookback);
  const price = data[data.length - 1].close;
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = wing; i < data.length - wing; i++) {
    const win = data.slice(i - wing, i + wing + 1);
    if (data[i].high === Math.max(...win.map((x) => x.high))) highs.push(data[i].high);
    if (data[i].low === Math.min(...win.map((x) => x.low))) lows.push(data[i].low);
  }
  const cluster = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const groups: number[][] = [];
    for (const v of sorted) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(v - g[g.length - 1]) / v < 0.006) g.push(v);
      else groups.push([v]);
    }
    return groups.map((g) => ({ price: g.reduce((a, b) => a + b, 0) / g.length, touches: g.length }));
  };
  const all = cluster([...highs, ...lows]);
  const support = all
    .filter((l) => l.price < price)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
  const resistance = all
    .filter((l) => l.price > price)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);
  return { support, resistance };
}

const last = <T,>(a: (T | null)[]) => {
  for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i] as T;
  return null;
};

export type TechSnapshot = ReturnType<typeof analyze>;

export function analyze(c: Candle[]) {
  const closes = c.map((x) => x.close);
  const price = closes[closes.length - 1];
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes);
  const m = macd(closes);
  const a = atr(c);
  const bb = bollinger(closes);
  const lv = levels(c);

  const ema20 = last(e20);
  const ema50 = last(e50);
  const ema200 = last(e200);
  const rsiNow = last(r);
  const macdHist = last(m.hist);
  const prevHist = m.hist.length > 1 ? m.hist[m.hist.length - 2] : null;
  const atrNow = last(a);

  // Rule-based score: -100 (strong bearish) .. +100 (strong bullish)
  let score = 0;
  const reasons: string[] = [];
  if (ema50 != null) {
    if (price > ema50) { score += 20; reasons.push("Price above EMA50"); }
    else { score -= 20; reasons.push("Price below EMA50"); }
  }
  if (ema200 != null) {
    if (price > ema200) { score += 20; reasons.push("Price above EMA200 (long-term uptrend)"); }
    else { score -= 20; reasons.push("Price below EMA200 (long-term downtrend)"); }
  }
  if (ema20 != null && ema50 != null) {
    if (ema20 > ema50) { score += 15; reasons.push("EMA20 > EMA50 (short-term momentum up)"); }
    else { score -= 15; reasons.push("EMA20 < EMA50 (short-term momentum down)"); }
  }
  if (macdHist != null) {
    if (macdHist > 0) { score += 15; reasons.push("MACD histogram positive"); }
    else { score -= 15; reasons.push("MACD histogram negative"); }
    if (prevHist != null && Math.sign(prevHist) !== Math.sign(macdHist))
      reasons.push(macdHist > 0 ? "Fresh MACD bullish cross" : "Fresh MACD bearish cross");
  }
  if (rsiNow != null) {
    if (rsiNow > 70) { score -= 10; reasons.push(`RSI ${rsiNow.toFixed(1)} overbought`); }
    else if (rsiNow < 30) { score += 10; reasons.push(`RSI ${rsiNow.toFixed(1)} oversold`); }
    else if (rsiNow > 55) { score += 10; reasons.push(`RSI ${rsiNow.toFixed(1)} bullish zone`); }
    else if (rsiNow < 45) { score -= 10; reasons.push(`RSI ${rsiNow.toFixed(1)} bearish zone`); }
  }
  const bias =
    score >= 50 ? "Strong bullish" : score >= 15 ? "Bullish" : score <= -50 ? "Strong bearish" : score <= -15 ? "Bearish" : "Neutral";

  const first = closes[Math.max(0, closes.length - 31)];
  const vol20 = c.slice(-20).reduce((s, x) => s + x.volume, 0) / Math.min(20, c.length);

  return {
    price,
    changePctPeriod: ((price - first) / first) * 100,
    ema20, ema50, ema200,
    rsi: rsiNow,
    macd: { line: last(m.line), signal: last(m.signal), hist: macdHist },
    atr: atrNow,
    atrPct: atrNow != null ? (atrNow / price) * 100 : null,
    bollinger: bb,
    support: lv.support,
    resistance: lv.resistance,
    volumeVsAvg20: vol20 > 0 ? c[c.length - 1].volume / vol20 : null,
    score,
    bias,
    reasons,
    // ATR-based risk framework (not advice): 1.5 ATR stop, 2R / 3R targets
    riskPlan:
      atrNow != null
        ? {
            long: { stop: price - 1.5 * atrNow, tp1: price + 3 * atrNow, tp2: price + 4.5 * atrNow },
            short: { stop: price + 1.5 * atrNow, tp1: price - 3 * atrNow, tp2: price - 4.5 * atrNow },
          }
        : null,
  };
}
