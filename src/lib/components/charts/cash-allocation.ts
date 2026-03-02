import type { Candle } from "$lib/etoro-api";
import {
  computeOpportunityMetrics,
  type OpportunityMetrics,
  type OpportunityMetricKey,
} from "$lib/candle-utils";
import { type BucketComputed, bucketColor } from "./target-allocation.svelte.ts";

export type AllocationMode = "target" | "rebalance";
export type DistributionMode = "proportional" | "opportunity";

export type SymbolAllocation = {
  symbol: string;
  instrumentId: number;
  currentValue: number;
  allocation: number;
  excluded: boolean;
  metrics?: OpportunityMetrics;
};

export type BucketAllocation = {
  bucketId: string;
  bucketName: string;
  allocation: number;
  symbolAllocations: SymbolAllocation[];
};

export type FeeInfo = {
  orderCount: number;
  totalFees: number;
};

export type FlatRow = SymbolAllocation & {
  bucketName: string;
  bucketColor: string;
  rank: number;
};

export const FEE_PER_ORDER = 1;

export function buildMetricsMap(
  buckets: BucketComputed[],
  candleMap: Map<number, Candle[]>,
): Map<string, OpportunityMetrics> {
  const map = new Map<string, OpportunityMetrics>();
  for (const b of buckets) {
    for (const s of b.symbolDetails) {
      if (map.has(s.symbol)) continue;
      const candles = candleMap.get(s.instrumentId);
      if (candles && candles.length >= 2) {
        map.set(s.symbol, computeOpportunityMetrics(candles));
      }
    }
  }
  return map;
}

function includedSymbols(
  bucket: BucketComputed,
  excluded: Set<string>,
) {
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

function distributeToSymbols(
  bucket: BucketComputed,
  bucketAllocation: number,
  excluded: Set<string>,
  metricsMap: Map<string, OpportunityMetrics>,
  distributionMode: DistributionMode,
  selectedMetric: OpportunityMetricKey,
): SymbolAllocation[] {
  const included = includedSymbols(bucket, excluded);

  if (distributionMode === "opportunity" && included.length > 0) {
    const scoreMap = new Map<string, number>();
    let totalScore = 0;
    for (const s of included) {
      const v = metricsMap.get(s.symbol)?.[selectedMetric];
      const score = v != null ? Math.max(0, -v) : 0;
      scoreMap.set(s.symbol, score);
      totalScore += score;
    }

    return bucket.symbolDetails.map((s) => {
      const isExcluded = excluded.has(s.symbol);
      let allocation = 0;
      if (!isExcluded) {
        if (totalScore > 0) {
          allocation =
            ((scoreMap.get(s.symbol) ?? 0) / totalScore) * bucketAllocation;
        } else {
          allocation = bucketAllocation / included.length;
        }
      }
      return {
        symbol: s.symbol,
        instrumentId: s.instrumentId,
        currentValue: s.marketValue,
        allocation,
        excluded: isExcluded,
        metrics: metricsMap.get(s.symbol),
      };
    });
  }

  const includedValue = included.reduce((sum, d) => sum + d.marketValue, 0);

  return bucket.symbolDetails.map((s) => {
    const isExcluded = excluded.has(s.symbol);
    let allocation = 0;
    if (!isExcluded) {
      allocation =
        includedValue > 0
          ? (s.marketValue / includedValue) * bucketAllocation
          : included.length > 0
            ? bucketAllocation / included.length
            : 0;
    }
    return {
      symbol: s.symbol,
      instrumentId: s.instrumentId,
      currentValue: s.marketValue,
      allocation,
      excluded: isExcluded,
      metrics: metricsMap.get(s.symbol),
    };
  });
}

export function computeAllocations(opts: {
  buckets: BucketComputed[];
  totalTargetPercent: number;
  totalAssignedMarketValue: number;
  cashAmount: number;
  allocationMode: AllocationMode;
  distributionMode: DistributionMode;
  selectedMetric: OpportunityMetricKey;
  excludedSymbols: Set<string>;
  metricsMap: Map<string, OpportunityMetrics>;
}): { allocations: BucketAllocation[]; fees: FeeInfo } {
  const {
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    cashAmount,
    allocationMode,
    distributionMode,
    selectedMetric,
    excludedSymbols,
    metricsMap,
  } = opts;

  const empty: { allocations: BucketAllocation[]; fees: FeeInfo } = {
    allocations: [],
    fees: { orderCount: 0, totalFees: 0 },
  };

  const validBuckets = buckets.filter((b) => b.targetPercent > 0);
  if (cashAmount <= 0 || validBuckets.length === 0 || totalTargetPercent <= 0)
    return empty;

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

  // Only buckets that have at least one included symbol can receive cash.
  const activeBuckets = bucketsWithEffective.filter(
    ({ bucket: b }) => includedSymbols(b, excludedSymbols).length > 0,
  );

  let results: BucketAllocation[];

  if (allocationMode === "target") {
    const activeTargetSum = activeBuckets.reduce(
      (s, e) => s + e.bucket.targetPercent, 0,
    );
    results = activeBuckets.map(({ bucket: b }) => {
      const allocation =
        activeTargetSum > 0 ? (b.targetPercent / activeTargetSum) * cashAmount : 0;
      return {
        bucketId: b.id,
        bucketName: b.name || "Unnamed",
        allocation,
        symbolAllocations: distributeToSymbols(
          b, allocation, excludedSymbols, metricsMap, distributionMode, selectedMetric,
        ),
      };
    });
  } else {
    const newTotal = adjustedPortfolio + cashAmount;
    const shortfalls = activeBuckets.map(({ bucket: b, effective }) => {
      const idealValue = (b.targetPercent / 100) * newTotal;
      return { bucket: b, shortfall: Math.max(0, idealValue - effective) };
    });
    const totalShortfall = shortfalls.reduce((s, e) => s + e.shortfall, 0);

    results = shortfalls.map(({ bucket: b, shortfall }) => {
      const allocation =
        totalShortfall > 0 ? (shortfall / totalShortfall) * cashAmount : 0;
      return {
        bucketId: b.id,
        bucketName: b.name || "Unnamed",
        allocation,
        symbolAllocations: distributeToSymbols(
          b, allocation, excludedSymbols, metricsMap, distributionMode, selectedMetric,
        ),
      };
    });
  }

  // Include fully-excluded buckets with zero allocation so they appear in the list
  for (const { bucket: b } of bucketsWithEffective) {
    if (results.some((r) => r.bucketId === b.id)) continue;
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
      })),
    });
  }

  const orderCount = results
    .flatMap((e) => e.symbolAllocations)
    .filter((s) => !s.excluded && s.allocation >= 0.01).length;

  return {
    allocations: results,
    fees: { orderCount, totalFees: orderCount * FEE_PER_ORDER },
  };
}

export function buildFlatList(opts: {
  allocations: BucketAllocation[];
  buckets: BucketComputed[];
  sortByOpportunity: boolean;
  hasMetrics: boolean;
  selectedMetric: OpportunityMetricKey;
}): FlatRow[] {
  const { allocations, buckets, sortByOpportunity, hasMetrics, selectedMetric } = opts;

  const bucketIndexMap = new Map<string, number>();
  buckets.forEach((b, i) => bucketIndexMap.set(b.id, i));

  const rows: FlatRow[] = [];
  for (const entry of allocations) {
    const idx = bucketIndexMap.get(entry.bucketId) ?? 0;
    const color = bucketColor(
      buckets[idx] ?? { id: entry.bucketId, name: "", targetPercent: 0, symbols: [] },
      idx,
    );
    for (const sym of entry.symbolAllocations) {
      rows.push({ ...sym, bucketName: entry.bucketName, bucketColor: color, rank: 0 });
    }
  }

  rows.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    const aZero = a.allocation < 0.01 ? 1 : 0;
    const bZero = b.allocation < 0.01 ? 1 : 0;
    if (aZero !== bZero) return aZero - bZero;
    if (sortByOpportunity && hasMetrics) {
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
