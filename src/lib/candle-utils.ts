import type { Candle } from "$lib/etoro-api";

export function findCandleByDate(
  candles: Candle[],
  targetDate: Date,
): Candle | undefined {
  const target = targetDate.getTime();
  let best: Candle | undefined;
  let bestDist = Infinity;
  for (const c of candles) {
    const d = new Date(c.date).getTime();
    if (d > target) break;
    const dist = Math.abs(d - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function sma(candles: Candle[], period: number): number | undefined {
  if (candles.length < period) return undefined;
  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return sum / period;
}

export type OpportunityMetrics = {
  change1D?: number;
  change7D?: number;
  change1M?: number;
  change3M?: number;
  change6M?: number;
  changeYTD?: number;
  diff200MA?: number;
};

export type OpportunityMetricKey = keyof OpportunityMetrics;

export const METRIC_LABELS: Record<OpportunityMetricKey, string> = {
  diff200MA: "200 MA",
  change1D: "1D",
  change7D: "7D",
  change1M: "1M",
  change3M: "3M",
  change6M: "6M",
  changeYTD: "YTD",
};

export function computeOpportunityMetrics(
  candles: Candle[],
  currentRate?: number,
): OpportunityMetrics {
  if (candles.length < 2) return {};

  const latest = candles[candles.length - 1];
  const currentPrice = currentRate ?? latest.close;

  const now = new Date();
  const d1 = new Date(now);
  d1.setDate(d1.getDate() - 1);
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const m1 = new Date(now);
  m1.setMonth(m1.getMonth() - 1);
  const m3 = new Date(now);
  m3.setMonth(m3.getMonth() - 3);
  const m6 = new Date(now);
  m6.setMonth(m6.getMonth() - 6);
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  const c1d = findCandleByDate(candles, d1);
  const c7d = findCandleByDate(candles, d7);
  const c1m = findCandleByDate(candles, m1);
  const c3m = findCandleByDate(candles, m3);
  const c6m = findCandleByDate(candles, m6);
  const cYtd = findCandleByDate(candles, ytdStart);
  const ma200 = sma(candles, 200);

  return {
    change1D: c1d ? pctChange(currentPrice, c1d.close) : undefined,
    change7D: c7d ? pctChange(currentPrice, c7d.close) : undefined,
    change1M: c1m ? pctChange(currentPrice, c1m.close) : undefined,
    change3M: c3m ? pctChange(currentPrice, c3m.close) : undefined,
    change6M: c6m ? pctChange(currentPrice, c6m.close) : undefined,
    changeYTD: cYtd ? pctChange(currentPrice, cYtd.close) : undefined,
    diff200MA: ma200 ? pctChange(currentPrice, ma200) : undefined,
  };
}
