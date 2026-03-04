import type { Candle } from "$lib/etoro-api";
import {
  computeOpportunityMetrics,
  METRIC_LABELS,
  type OpportunityMetrics,
  type OpportunityMetricKey,
} from "$lib/candle-utils";
import {
  type BucketComputed,
  bucketColor,
} from "./target-allocation.svelte.ts";

export type AllocationMode = "rebalance" | "target" | "opportunity" | "equal";

export type WithinBucketStrategy = "market-value" | "signal-weighted";

export type PortfolioSymbol = {
  symbol: string;
  instrumentId: number;
  marketValue: number;
};

export type SymbolAllocation = {
  symbol: string;
  instrumentId: number;
  currentValue: number;
  allocation: number;
  excluded: boolean;
  belowMinimum?: boolean;
  metrics?: OpportunityMetrics;
  reason?: string;
};

export type BucketAllocation = {
  bucketId: string;
  bucketName: string;
  allocation: number;
  symbolAllocations: SymbolAllocation[];
};

export type BucketProjection = {
  bucketId: string;
  bucketName: string;
  beforePercent: number;
  afterPercent: number;
  targetPercent: number;
};

export type FeeInfo = {
  orderCount: number;
  totalFees: number;
  belowMinCount: number;
};

export type FlatRow = SymbolAllocation & {
  bucketName: string;
  bucketColor: string;
  rank: number;
  forced?: boolean;
};

export const FEE_PER_ORDER = 1;
export const MIN_ORDER_AMOUNT = 10;

export function buildMetricsMap(
  allSymbols: PortfolioSymbol[],
  candleMap: Map<number, Candle[]>,
): Map<string, OpportunityMetrics> {
  const map = new Map<string, OpportunityMetrics>();
  for (const s of allSymbols) {
    if (map.has(s.symbol)) continue;
    const candles = candleMap.get(s.instrumentId);
    if (candles && candles.length >= 2) {
      map.set(s.symbol, computeOpportunityMetrics(candles));
    }
  }
  return map;
}

function includedSymbols(bucket: BucketComputed, excluded: Set<string>) {
  return bucket.symbolDetails.filter((s) => !excluded.has(s.symbol));
}

function effectiveMarketValue(
  bucket: BucketComputed,
  excluded: Set<string>,
): number {
  return includedSymbols(bucket, excluded).reduce(
    (sum, s) => sum + s.marketValue,
    0,
  );
}

function computeSignalWeights(
  symbols: { symbol: string; marketValue: number }[],
  metricsMap: Map<string, OpportunityMetrics>,
  selectedMetric: OpportunityMetricKey,
): Map<string, { weight: number; score: number }> {
  const result = new Map<string, { weight: number; score: number }>();
  let totalWeighted = 0;

  const entries = symbols.map((s) => {
    const v = metricsMap.get(s.symbol)?.[selectedMetric];
    const signal = v != null ? Math.max(0, -v) : 0;
    const weighted = (1 + signal) * Math.max(s.marketValue, 0.01);
    return { symbol: s.symbol, weighted, signal };
  });

  for (const e of entries) totalWeighted += e.weighted;

  for (const e of entries) {
    result.set(e.symbol, {
      weight:
        totalWeighted > 0 ? e.weighted / totalWeighted : 1 / entries.length,
      score: e.signal,
    });
  }

  return result;
}

function distributeToSymbols(
  bucket: BucketComputed,
  bucketAllocation: number,
  excluded: Set<string>,
  metricsMap: Map<string, OpportunityMetrics>,
  bucketReason: string,
  strategy: WithinBucketStrategy = "market-value",
  selectedMetric: OpportunityMetricKey = "diff200MA",
): SymbolAllocation[] {
  const included = includedSymbols(bucket, excluded);
  const includedValue = included.reduce((sum, d) => sum + d.marketValue, 0);

  const useSignal = strategy === "signal-weighted" && metricsMap.size > 0;
  const signalWeights = useSignal
    ? computeSignalWeights(included, metricsMap, selectedMetric)
    : null;

  return bucket.symbolDetails.map((s) => {
    const isExcluded = excluded.has(s.symbol);
    let allocation = 0;
    let reason = "";
    if (isExcluded) {
      reason = "Excluded";
    } else if (signalWeights && included.length > 0) {
      const sw = signalWeights.get(s.symbol);
      const weight = sw?.weight ?? 0;
      allocation = weight * bucketAllocation;
      const metricVal = metricsMap.get(s.symbol)?.[selectedMetric];
      const signalStr =
        metricVal != null ? ` · signal ${metricVal.toFixed(1)}%` : "";
      reason =
        bucketAllocation < 0.01
          ? bucketReason
          : `${(weight * 100).toFixed(1)}% weight${signalStr} · ${bucketReason}`;
    } else if (includedValue > 0) {
      const pct = (s.marketValue / includedValue) * 100;
      allocation = (s.marketValue / includedValue) * bucketAllocation;
      reason =
        bucketAllocation < 0.01
          ? bucketReason
          : `$${fmtNum(s.marketValue)} / $${fmtNum(includedValue)} = ${pct.toFixed(1)}% weight · ${bucketReason}`;
    } else if (included.length > 0) {
      allocation = bucketAllocation / included.length;
      reason =
        bucketAllocation < 0.01
          ? bucketReason
          : `Equal split (1/${included.length}) · ${bucketReason}`;
    } else {
      reason = bucketReason;
    }
    return {
      symbol: s.symbol,
      instrumentId: s.instrumentId,
      currentValue: s.marketValue,
      allocation,
      excluded: isExcluded,
      metrics: metricsMap.get(s.symbol),
      reason,
    };
  });
}

function redistributeToForced(
  allocations: SymbolAllocation[],
  forced: Set<string>,
  totalCash: number,
): void {
  if (forced.size === 0 || totalCash <= 0) return;
  const zeroForced = allocations.filter(
    (s) => !s.excluded && forced.has(s.symbol) && s.allocation < 0.01,
  );
  if (zeroForced.length === 0) return;

  const activeRows = allocations.filter(
    (s) => !s.excluded && s.allocation >= 0.01,
  );
  const totalActive = activeRows.reduce((sum, s) => sum + s.allocation, 0);
  if (totalActive <= 0) return;

  const sharePerForced = totalCash / (activeRows.length + zeroForced.length);
  const totalForced = sharePerForced * zeroForced.length;
  const scaleFactor = (totalActive - totalForced) / totalActive;

  if (scaleFactor <= 0) return;

  for (const row of activeRows) {
    row.allocation *= scaleFactor;
  }
  for (const row of zeroForced) {
    row.allocation = sharePerForced;
    row.reason = "Forced inclusion (equal share)";
  }
}

function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
}

function computeOpportunityAllocations(opts: {
  allSymbols: PortfolioSymbol[];
  cashAmount: number;
  selectedMetric: OpportunityMetricKey;
  excludedSymbols: Set<string>;
  forcedSymbols: Set<string>;
  metricsMap: Map<string, OpportunityMetrics>;
}): AllocationsResult {
  const {
    allSymbols,
    cashAmount,
    selectedMetric,
    excludedSymbols,
    forcedSymbols,
    metricsMap,
  } = opts;

  const included = allSymbols.filter((s) => !excludedSymbols.has(s.symbol));
  if (included.length === 0) {
    return {
      allocations: [],
      fees: { orderCount: 0, totalFees: 0, belowMinCount: 0 },
      projections: [],
      rebalanceProgress: null,
    };
  }

  const scoreMap = new Map<string, number>();
  let totalScore = 0;
  for (const s of included) {
    const v = metricsMap.get(s.symbol)?.[selectedMetric];
    const score = v != null ? Math.max(0, -v) : 0;
    scoreMap.set(s.symbol, score);
    totalScore += score;
  }

  const symbolAllocations: SymbolAllocation[] = allSymbols.map((s) => {
    const isExcluded = excludedSymbols.has(s.symbol);
    let allocation = 0;
    let reason = "";
    if (isExcluded) {
      reason = "Excluded";
    } else if (totalScore > 0) {
      const score = scoreMap.get(s.symbol) ?? 0;
      allocation = (score / totalScore) * cashAmount;
      const pct = (score / totalScore) * 100;
      const metricVal = metricsMap.get(s.symbol)?.[selectedMetric];
      reason =
        metricVal != null
          ? `${pct.toFixed(1)}% weight (signal ${metricVal.toFixed(2)}%)`
          : `${pct.toFixed(1)}% weight`;
    } else {
      allocation = cashAmount / included.length;
      reason = "Equal split (no signal spread)";
    }
    return {
      symbol: s.symbol,
      instrumentId: s.instrumentId,
      currentValue: s.marketValue,
      allocation,
      excluded: isExcluded,
      metrics: metricsMap.get(s.symbol),
      reason,
    };
  });

  redistributeToForced(symbolAllocations, forcedSymbols, cashAmount);
  flagBelowMinimum(symbolAllocations);

  const orderCount = symbolAllocations.filter(
    (s) => !s.excluded && s.allocation >= 0.01,
  ).length;
  const belowMinCount = symbolAllocations.filter((s) => s.belowMinimum).length;

  return {
    allocations: [
      {
        bucketId: "__opportunity__",
        bucketName: "By opportunity",
        allocation: cashAmount,
        symbolAllocations,
      },
    ],
    fees: { orderCount, totalFees: orderCount * FEE_PER_ORDER, belowMinCount },
    projections: [],
    rebalanceProgress: null,
  };
}

function computeEqualAllocations(opts: {
  allSymbols: PortfolioSymbol[];
  cashAmount: number;
  excludedSymbols: Set<string>;
  forcedSymbols: Set<string>;
  metricsMap: Map<string, OpportunityMetrics>;
}): AllocationsResult {
  const { allSymbols, cashAmount, excludedSymbols, forcedSymbols, metricsMap } =
    opts;

  const included = allSymbols.filter((s) => !excludedSymbols.has(s.symbol));
  if (included.length === 0) {
    return {
      allocations: [],
      fees: { orderCount: 0, totalFees: 0, belowMinCount: 0 },
      projections: [],
      rebalanceProgress: null,
    };
  }

  const perSymbol = cashAmount / included.length;

  const symbolAllocations: SymbolAllocation[] = allSymbols.map((s) => {
    const isExcluded = excludedSymbols.has(s.symbol);
    return {
      symbol: s.symbol,
      instrumentId: s.instrumentId,
      currentValue: s.marketValue,
      allocation: isExcluded ? 0 : perSymbol,
      excluded: isExcluded,
      metrics: metricsMap.get(s.symbol),
      reason: isExcluded
        ? "Excluded"
        : `Equal split (1/${included.length})`,
    };
  });

  redistributeToForced(symbolAllocations, forcedSymbols, cashAmount);
  flagBelowMinimum(symbolAllocations);

  const orderCount = symbolAllocations.filter(
    (s) => !s.excluded && s.allocation >= 0.01,
  ).length;
  const belowMinCount = symbolAllocations.filter((s) => s.belowMinimum).length;

  return {
    allocations: [
      {
        bucketId: "__equal__",
        bucketName: "Equal split",
        allocation: cashAmount,
        symbolAllocations,
      },
    ],
    fees: { orderCount, totalFees: orderCount * FEE_PER_ORDER, belowMinCount },
    projections: [],
    rebalanceProgress: null,
  };
}

function flagBelowMinimum(allocations: SymbolAllocation[]): void {
  for (const s of allocations) {
    if (!s.excluded && s.allocation > 0 && s.allocation < MIN_ORDER_AMOUNT) {
      s.belowMinimum = true;
      s.reason =
        (s.reason ? s.reason + " · " : "") + `below $${MIN_ORDER_AMOUNT} min`;
    }
  }
}

export type AllocationsResult = {
  allocations: BucketAllocation[];
  fees: FeeInfo;
  projections: BucketProjection[];
  rebalanceProgress: number | null;
};

export function computeAllocations(opts: {
  buckets: BucketComputed[];
  totalTargetPercent: number;
  totalAssignedMarketValue: number;
  cashAmount: number;
  allocationMode: AllocationMode;
  selectedMetric: OpportunityMetricKey;
  excludedSymbols: Set<string>;
  forcedSymbols?: Set<string>;
  metricsMap: Map<string, OpportunityMetrics>;
  allSymbols?: PortfolioSymbol[];
  withinBucketStrategy?: WithinBucketStrategy;
}): AllocationsResult {
  const {
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    cashAmount,
    allocationMode,
    selectedMetric,
    excludedSymbols,
    forcedSymbols = new Set(),
    metricsMap,
    allSymbols,
    withinBucketStrategy = "market-value",
  } = opts;

  const empty: AllocationsResult = {
    allocations: [],
    fees: { orderCount: 0, totalFees: 0, belowMinCount: 0 },
    projections: [],
    rebalanceProgress: null,
  };

  if (cashAmount <= 0) return empty;

  if (allocationMode === "equal") {
    if (!allSymbols || allSymbols.length === 0) return empty;
    return computeEqualAllocations({
      allSymbols,
      cashAmount,
      excludedSymbols,
      forcedSymbols,
      metricsMap,
    });
  }

  if (allocationMode === "opportunity") {
    if (!allSymbols || allSymbols.length === 0) return empty;
    return computeOpportunityAllocations({
      allSymbols,
      cashAmount,
      selectedMetric,
      excludedSymbols,
      forcedSymbols,
      metricsMap,
    });
  }

  const validBuckets = buckets.filter((b) => b.targetPercent > 0);
  if (validBuckets.length === 0 || totalTargetPercent <= 0) return empty;

  let excludedValue = 0;
  for (const b of buckets) {
    for (const s of b.symbolDetails) {
      if (excludedSymbols.has(s.symbol)) excludedValue += s.marketValue;
    }
  }
  const adjustedPortfolio = totalAssignedMarketValue - excludedValue;

  const bucketsWithEffective = validBuckets.map((b) => ({
    bucket: b,
    effective: effectiveMarketValue(b, excludedSymbols),
  }));

  const activeBuckets = bucketsWithEffective.filter(
    ({ bucket: b }) => includedSymbols(b, excludedSymbols).length > 0,
  );

  let results: BucketAllocation[];
  const newTotal = adjustedPortfolio + cashAmount;

  if (allocationMode === "target") {
    const activeTargetSum = activeBuckets.reduce(
      (s, e) => s + e.bucket.targetPercent,
      0,
    );
    results = activeBuckets.map(({ bucket: b }) => {
      const allocation =
        activeTargetSum > 0
          ? (b.targetPercent / activeTargetSum) * cashAmount
          : 0;
      const bucketPct =
        activeTargetSum > 0 ? (b.targetPercent / activeTargetSum) * 100 : 0;
      const bucketReason = `${b.name || "Unnamed"}: $${fmtNum(allocation)} (${bucketPct.toFixed(0)}% of target weight)`;
      return {
        bucketId: b.id,
        bucketName: b.name || "Unnamed",
        allocation,
        symbolAllocations: distributeToSymbols(
          b,
          allocation,
          excludedSymbols,
          metricsMap,
          bucketReason,
          withinBucketStrategy,
          selectedMetric,
        ),
      };
    });
  } else {
    const shortfalls = activeBuckets.map(({ bucket: b, effective }) => {
      const idealValue = (b.targetPercent / 100) * newTotal;
      const shortfall = Math.max(0, idealValue - effective);
      const surplus = Math.max(0, effective - idealValue);
      return { bucket: b, effective, shortfall, surplus };
    });
    const totalShortfall = shortfalls.reduce((s, e) => s + e.shortfall, 0);

    results = shortfalls.map(({ bucket: b, effective, shortfall, surplus }) => {
      const allocation =
        totalShortfall > 0 ? (shortfall / totalShortfall) * cashAmount : 0;
      const shortfallPct =
        totalShortfall > 0 ? (shortfall / totalShortfall) * 100 : 0;
      const actualPct = newTotal > 0 ? (effective / newTotal) * 100 : 0;
      let bucketReason: string;
      if (surplus > 0) {
        bucketReason = `${b.name || "Unnamed"}: overweight by $${fmtNum(surplus)} (${actualPct.toFixed(1)}% vs ${b.targetPercent}% target)`;
      } else if (shortfall > 0) {
        bucketReason = `${b.name || "Unnamed"}: $${fmtNum(shortfall)} shortfall (${shortfallPct.toFixed(0)}% of total gap $${fmtNum(totalShortfall)})`;
      } else {
        bucketReason = `${b.name || "Unnamed"}: at target (${actualPct.toFixed(1)}% vs ${b.targetPercent}%)`;
      }
      return {
        bucketId: b.id,
        bucketName: b.name || "Unnamed",
        allocation,
        symbolAllocations: distributeToSymbols(
          b,
          allocation,
          excludedSymbols,
          metricsMap,
          bucketReason,
          withinBucketStrategy,
          selectedMetric,
        ),
      };
    });

    // Emit overweight buckets that were filtered out as active
    // (buckets in bucketsWithEffective but not in activeBuckets because all symbols excluded)
    // are already handled below. But we also need to show overweight buckets that ARE active
    // but have zero shortfall -- those are already in `results` above with allocation=0.
    // We additionally need to show buckets with all symbols excluded that are overweight.
  }

  // Append fully-excluded buckets
  for (const { bucket: b, effective } of bucketsWithEffective) {
    if (results.some((r) => r.bucketId === b.id)) continue;
    const idealValue = (b.targetPercent / 100) * newTotal;
    const surplus = Math.max(0, effective - idealValue);
    const actualPct = newTotal > 0 ? (effective / newTotal) * 100 : 0;
    const reason =
      surplus > 0
        ? `Excluded · overweight by $${fmtNum(surplus)} (${actualPct.toFixed(1)}% vs ${b.targetPercent}%)`
        : "Excluded";
    results.push({
      bucketId: b.id,
      bucketName: b.name || "Unnamed",
      allocation: 0,
      symbolAllocations: b.symbolDetails.map((s) => ({
        symbol: s.symbol,
        instrumentId: s.instrumentId,
        currentValue: s.marketValue,
        allocation: 0,
        excluded: true,
        metrics: metricsMap.get(s.symbol),
        reason,
      })),
    });
  }

  const allSymAllocs = results.flatMap((e) => e.symbolAllocations);
  redistributeToForced(allSymAllocs, forcedSymbols, cashAmount);
  flagBelowMinimum(allSymAllocs);

  const orderCount = allSymAllocs.filter(
    (s) => !s.excluded && s.allocation >= 0.01,
  ).length;
  const belowMinCount = allSymAllocs.filter((s) => s.belowMinimum).length;

  // Projections for bucket-based modes
  const projections: BucketProjection[] = bucketsWithEffective.map(
    ({ bucket: b, effective }) => {
      const bucketAlloc =
        results.find((r) => r.bucketId === b.id)?.allocation ?? 0;
      const beforePct =
        totalAssignedMarketValue > 0
          ? (effective / totalAssignedMarketValue) * 100
          : 0;
      const afterPct =
        newTotal > 0 ? ((effective + bucketAlloc) / newTotal) * 100 : 0;
      return {
        bucketId: b.id,
        bucketName: b.name || "Unnamed",
        beforePercent: beforePct,
        afterPercent: afterPct,
        targetPercent: b.targetPercent,
      };
    },
  );

  // Rebalance progress (only for rebalance mode)
  let rebalanceProgress: number | null = null;
  if (allocationMode === "rebalance") {
    let shortfallBefore = 0;
    let shortfallAfter = 0;
    for (const { bucket: b, effective } of bucketsWithEffective) {
      const ideal = (b.targetPercent / 100) * newTotal;
      shortfallBefore += Math.max(0, ideal - effective);
      const bucketAlloc =
        results.find((r) => r.bucketId === b.id)?.allocation ?? 0;
      shortfallAfter += Math.max(0, ideal - (effective + bucketAlloc));
    }
    rebalanceProgress =
      shortfallBefore > 0
        ? Math.round((1 - shortfallAfter / shortfallBefore) * 100)
        : 100;
  }

  return {
    allocations: results,
    fees: { orderCount, totalFees: orderCount * FEE_PER_ORDER, belowMinCount },
    projections,
    rebalanceProgress,
  };
}

export type ModePreview = {
  mode: AllocationMode;
  label: string;
  result: AllocationsResult;
  topSymbols: { symbol: string; allocation: number }[];
};

export type Recommendation = {
  mode: AllocationMode;
  label: string;
  summary: string;
  topSymbols: { symbol: string; allocation: number }[];
  orderCount: number;
  totalFees: number;
};

const MODE_LABELS: Record<AllocationMode, string> = {
  rebalance: "Rebalance",
  target: "By target %",
  opportunity: "By opportunity",
  equal: "Equal split",
};

export function computeAllModes(opts: {
  buckets: BucketComputed[];
  totalTargetPercent: number;
  totalAssignedMarketValue: number;
  cashAmount: number;
  selectedMetric: OpportunityMetricKey;
  excludedSymbols: Set<string>;
  forcedSymbols: Set<string>;
  metricsMap: Map<string, OpportunityMetrics>;
  allSymbols: PortfolioSymbol[];
  withinBucketStrategy: WithinBucketStrategy;
  hasBucketTargets: boolean;
  hasMetrics: boolean;
}): ModePreview[] {
  const {
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    cashAmount,
    selectedMetric,
    excludedSymbols,
    forcedSymbols,
    metricsMap,
    allSymbols,
    withinBucketStrategy,
    hasBucketTargets,
    hasMetrics,
  } = opts;

  if (cashAmount <= 0 || allSymbols.length === 0) return [];

  const modes: AllocationMode[] = [];
  if (hasBucketTargets) modes.push("rebalance", "target");
  if (hasMetrics) modes.push("opportunity");
  modes.push("equal");

  return modes.map((mode) => {
    const result = computeAllocations({
      buckets,
      totalTargetPercent,
      totalAssignedMarketValue,
      cashAmount,
      allocationMode: mode,
      selectedMetric,
      excludedSymbols,
      forcedSymbols,
      metricsMap,
      allSymbols,
      withinBucketStrategy,
    });

    const allSymAllocs = result.allocations.flatMap((a) => a.symbolAllocations);
    const topSymbols = allSymAllocs
      .filter((s) => !s.excluded && s.allocation >= 0.01)
      .sort((a, b) => b.allocation - a.allocation)
      .slice(0, 5)
      .map((s) => ({ symbol: s.symbol, allocation: s.allocation }));

    return {
      mode,
      label: MODE_LABELS[mode],
      result,
      topSymbols,
    };
  });
}

export function computeRecommendation(opts: {
  previews: ModePreview[];
  buckets: BucketComputed[];
  totalAssignedMarketValue: number;
  cashAmount: number;
  metricsMap: Map<string, OpportunityMetrics>;
  selectedMetric: OpportunityMetricKey;
}): Recommendation | null {
  const {
    previews,
    buckets,
    totalAssignedMarketValue,
    cashAmount,
    metricsMap,
    selectedMetric,
  } = opts;

  if (previews.length === 0 || cashAmount <= 0) return null;

  const scores = new Map<AllocationMode, number>();

  for (const p of previews) {
    let score = 0;

    if (p.mode === "rebalance" && p.result.rebalanceProgress != null) {
      const progress = p.result.rebalanceProgress;
      score += progress * 0.5;

      const maxUnderweight = buckets.reduce((max, b) => {
        if (b.targetPercent <= 0) return max;
        const gap = b.targetPercent - b.actualPercent;
        return Math.max(max, gap);
      }, 0);
      if (maxUnderweight > 5) score += 25;
      else if (maxUnderweight > 2) score += 10;
    }

    if (p.mode === "target") {
      score += 20;
    }

    if (p.mode === "opportunity") {
      let negativeCount = 0;
      let totalNeg = 0;
      for (const [, m] of metricsMap) {
        const v = m[selectedMetric];
        if (v != null && v < -5) {
          negativeCount++;
          totalNeg += Math.abs(v);
        }
      }
      if (negativeCount >= 3) score += 30 + Math.min(totalNeg / negativeCount, 20);
      else if (negativeCount >= 1) score += 15;
    }

    if (p.mode === "equal") {
      score += 5;
    }

    const activeOrders = p.result.fees.orderCount;
    const belowMin = p.result.fees.belowMinCount;
    if (activeOrders > 0 && belowMin / activeOrders > 0.5) {
      score -= 10;
    }

    scores.set(p.mode, score);
  }

  let bestMode: AllocationMode = previews[0].mode;
  let bestScore = -Infinity;
  for (const [mode, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode;
    }
  }

  const best = previews.find((p) => p.mode === bestMode);
  if (!best) return null;

  const { fees, rebalanceProgress } = best.result;
  let summary: string;

  if (bestMode === "rebalance" && rebalanceProgress != null) {
    summary = `Deploy across ${fees.orderCount} positions to close ${rebalanceProgress}% of the allocation gap`;
  } else if (bestMode === "opportunity") {
    summary = `Weight toward the most discounted symbols by ${METRIC_LABELS[selectedMetric]} signal`;
  } else if (bestMode === "target") {
    summary = `Distribute by bucket target weights across ${fees.orderCount} positions`;
  } else {
    summary = `Split equally across ${fees.orderCount} positions`;
  }

  return {
    mode: bestMode,
    label: MODE_LABELS[bestMode],
    summary,
    topSymbols: best.topSymbols,
    orderCount: fees.orderCount,
    totalFees: fees.totalFees,
  };
}

export function buildFlatList(opts: {
  allocations: BucketAllocation[];
  buckets: BucketComputed[];
  allocationMode: AllocationMode;
  hasMetrics: boolean;
  selectedMetric: OpportunityMetricKey;
  forcedSymbols?: Set<string>;
}): FlatRow[] {
  const {
    allocations,
    buckets,
    allocationMode,
    hasMetrics,
    selectedMetric,
    forcedSymbols = new Set(),
  } = opts;

  const bucketIndexMap = new Map<string, number>();
  buckets.forEach((b, i) => bucketIndexMap.set(b.id, i));

  const rows: FlatRow[] = [];
  for (const entry of allocations) {
    const idx = bucketIndexMap.get(entry.bucketId) ?? -1;
    const color = idx >= 0 ? bucketColor(buckets[idx], idx) : "transparent";
    const name = idx >= 0 ? entry.bucketName : "";
    for (const sym of entry.symbolAllocations) {
      const isForced = forcedSymbols.has(sym.symbol);
      rows.push({
        ...sym,
        bucketName: name,
        bucketColor: color,
        rank: 0,
        forced: isForced || undefined,
      });
    }
  }

  const isOpportunity = allocationMode === "opportunity";

  rows.sort((a, b) => {
    const aTier = sortTier(a);
    const bTier = sortTier(b);
    if (aTier !== bTier) return aTier - bTier;
    if (isOpportunity && hasMetrics) {
      const av = a.metrics?.[selectedMetric] ?? Infinity;
      const bv = b.metrics?.[selectedMetric] ?? Infinity;
      return av - bv;
    }
    return 0;
  });

  let r = 1;
  for (const row of rows) {
    if (!row.excluded && row.allocation >= 0.01) row.rank = r++;
  }

  return rows;
}

function sortTier(row: FlatRow): number {
  if (row.excluded) return 3;
  if (row.allocation < 0.01 && !row.forced) return 2;
  if (row.forced) return 1;
  return 0;
}
