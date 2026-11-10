"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Level = { price: number; touches: number };

function emaSeries(c: Candle[], period: number) {
  const k = 2 / (period + 1);
  const out: { time: UTCTimestamp; value: number }[] = [];
  let prev: number | null = null;
  c.forEach((x, i) => {
    if (i < period - 1) return;
    if (prev == null) prev = c.slice(0, period).reduce((s, y) => s + y.close, 0) / period;
    else prev = x.close * k + prev * (1 - k);
    out.push({ time: x.time as UTCTimestamp, value: prev });
  });
  return out;
}

export function PriceChart({
  candles, support, resistance, intraday,
}: { candles: Candle[]; support: Level[]; resistance: Level[]; intraday: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const s = useRef<{
    candle: ISeriesApi<"Candlestick">; vol: ISeriesApi<"Histogram">;
    e20: ISeriesApi<"Line">; e50: ISeriesApi<"Line">; e200: ISeriesApi<"Line">; lines: IPriceLine[];
  } | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b8b99", fontFamily: "var(--font-geist-mono)" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)" },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const candle = c.addSeries(CandlestickSeries, {
      upColor: "#34d399", downColor: "#fb7185", borderVisible: false, wickUpColor: "#34d399", wickDownColor: "#fb7185",
    });
    const vol = c.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" } });
    c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const line = (color: string) =>
      c.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.current = { candle, vol, e20: line("#ffb547"), e50: line("#8b7bff"), e200: line("#38bdf8"), lines: [] };
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      s.current = null;
    };
  }, []);

  useEffect(() => {
    const ss = s.current;
    if (!ss || !chart.current) return;
    // second safety net: the chart library throws on null values or repeated / unsorted timestamps
    const fin = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    const seen = new Set<number>();
    const clean = candles
      .filter((x) => fin(x.time) && fin(x.open) && fin(x.high) && fin(x.low) && fin(x.close))
      .sort((a, b) => a.time - b.time)
      .filter((x) => (seen.has(x.time) ? false : (seen.add(x.time), true)));
    candles = clean;
    support = support.filter((l) => fin(l.price));
    resistance = resistance.filter((l) => fin(l.price));
    ss.candle.setData(candles.map((x) => ({ time: x.time as UTCTimestamp, open: x.open, high: x.high, low: x.low, close: x.close })));
    ss.vol.setData(
      candles.map((x) => ({ time: x.time as UTCTimestamp, value: fin(x.volume) ? x.volume : 0, color: x.close >= x.open ? "rgba(52,211,153,0.3)" : "rgba(251,113,133,0.3)" }))
    );
    ss.e20.setData(emaSeries(candles, 20));
    ss.e50.setData(emaSeries(candles, 50));
    ss.e200.setData(emaSeries(candles, 200));
    ss.lines.forEach((l) => ss.candle.removePriceLine(l));
    ss.lines = [
      ...support.map((l, i) => ss.candle.createPriceLine({ price: l.price, color: "rgba(52,211,153,0.7)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: `S${i + 1}` })),
      ...resistance.map((l, i) => ss.candle.createPriceLine({ price: l.price, color: "rgba(251,113,133,0.7)", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: `R${i + 1}` })),
    ];
    chart.current.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    chart.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 150), to: candles.length + 5 });
  }, [candles, support, resistance, intraday]);

  return <div ref={el} className="h-full w-full" />;
}
