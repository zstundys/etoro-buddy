import { describe, it, expect } from "vitest";
import type { OpportunityMetrics } from "$lib/candle-utils";
import type { BucketComputed } from "./target-allocation.svelte.ts";
import {
  type AllocationMode,
  type PortfolioSymbol,
  FEE_PER_ORDER,
  MIN_ORDER_AMOUNT,
  computeAllocations,
  buildFlatList,
} from "./cash-allocation.ts";

function makeBucket(
  overrides: Partial<BucketComputed> & { id: string; targetPercent: number },
): BucketComputed {
  return {
    name: overrides.id,
    symbols: overrides.symbolDetails?.map((s) => s.symbol) ?? [],
    actualPercent: 0,
    delta: 0,
    marketValue: 0,
    symbolDetails: [],
    ...overrides,
  };
}

function makeMetrics(diff200MA: number): OpportunityMetrics {
  return { diff200MA };
}

function totalAllocated(result: ReturnType<typeof computeAllocations>): number {
  return result.allocations
    .flatMap((a) => a.symbolAllocations)
    .filter((s) => !s.excluded)
    .reduce((sum, s) => sum + s.allocation, 0);
}

function allocationBySymbol(
  result: ReturnType<typeof computeAllocations>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of result.allocations) {
    for (const s of a.symbolAllocations) {
      map.set(s.symbol, (map.get(s.symbol) ?? 0) + s.allocation);
    }
  }
  return map;
}

const EMPTY_METRICS = new Map<string, OpportunityMetrics>();
const EMPTY_EXCLUDED = new Set<string>();

const bucketA = makeBucket({
  id: "a",
  targetPercent: 60,
  symbolDetails: [
    { symbol: "AAPL", instrumentId: 1, marketValue: 3000, weight: 50 },
    { symbol: "MSFT", instrumentId: 2, marketValue: 3000, weight: 50 },
  ],
});
const bucketB = makeBucket({
  id: "b",
  targetPercent: 40,
  symbolDetails: [
    { symbol: "GOOG", instrumentId: 3, marketValue: 2000, weight: 50 },
    { symbol: "AMZN", instrumentId: 4, marketValue: 2000, weight: 50 },
  ],
});
const buckets = [bucketA, bucketB];
const totalAssignedMarketValue = 10000;
const totalTargetPercent = 100;

function allocate(
  overrides: Partial<Parameters<typeof computeAllocations>[0]> = {},
) {
  return computeAllocations({
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    cashAmount: 1000,
    allocationMode: "target",
    selectedMetric: "diff200MA",
    excludedSymbols: EMPTY_EXCLUDED,
    metricsMap: EMPTY_METRICS,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// computeAllocations – early returns
// ---------------------------------------------------------------------------
describe("computeAllocations – early returns", () => {
  it("returns empty when cashAmount is 0", () => {
    const result = allocate({ cashAmount: 0 });
    expect(result.allocations).toHaveLength(0);
    expect(result.fees.orderCount).toBe(0);
  });

  it("returns empty when cashAmount is negative", () => {
    const result = allocate({ cashAmount: -100 });
    expect(result.allocations).toHaveLength(0);
  });

  it("returns empty for rebalance/target when no buckets have targets", () => {
    const empty = makeBucket({ id: "x", targetPercent: 0, symbolDetails: [] });
    const result = allocate({
      buckets: [empty],
      totalTargetPercent: 0,
      allocationMode: "rebalance",
    });
    expect(result.allocations).toHaveLength(0);
  });

  it("returns empty for opportunity mode when allSymbols is empty", () => {
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: [],
    });
    expect(result.allocations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – target mode
// ---------------------------------------------------------------------------
describe("computeAllocations – target mode", () => {
  it("total allocation equals cashAmount", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    expect(totalAllocated(result)).toBeCloseTo(1000);
  });

  it("splits cash proportionally to bucket target %", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    const bySymbol = allocationBySymbol(result);
    const bucketATotal =
      (bySymbol.get("AAPL") ?? 0) + (bySymbol.get("MSFT") ?? 0);
    const bucketBTotal =
      (bySymbol.get("GOOG") ?? 0) + (bySymbol.get("AMZN") ?? 0);
    expect(bucketATotal).toBeCloseTo(600);
    expect(bucketBTotal).toBeCloseTo(400);
  });

  it("distributes within bucket by market value weight", () => {
    const unevenBucket = makeBucket({
      id: "u",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "X", instrumentId: 10, marketValue: 750, weight: 75 },
        { symbol: "Y", instrumentId: 11, marketValue: 250, weight: 25 },
      ],
    });
    const result = allocate({
      buckets: [unevenBucket],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 1000,
      cashAmount: 400,
      allocationMode: "target",
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("X")).toBeCloseTo(300);
    expect(bySymbol.get("Y")).toBeCloseTo(100);
  });

  it("populates reason strings on each symbol", () => {
    const result = allocate({ cashAmount: 500, allocationMode: "target" });
    const sym = result.allocations[0].symbolAllocations[0];
    expect(sym.reason).toContain("% weight");
    expect(sym.reason).toContain("target");
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – rebalance mode
// ---------------------------------------------------------------------------
describe("computeAllocations – rebalance mode", () => {
  it("total allocation equals cashAmount", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "rebalance" });
    expect(totalAllocated(result)).toBeCloseTo(1000);
  });

  it("directs more cash to underweight buckets", () => {
    const overweight = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const underweight = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [overweight, underweight],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("UND")!).toBeGreaterThan(bySymbol.get("OVR")!);
  });

  it("gives $0 to a bucket already at or above target", () => {
    const atTarget = makeBucket({
      id: "at",
      targetPercent: 50,
      symbolDetails: [
        { symbol: "AT", instrumentId: 30, marketValue: 6000, weight: 100 },
      ],
    });
    const below = makeBucket({
      id: "below",
      targetPercent: 50,
      symbolDetails: [
        { symbol: "BLW", instrumentId: 31, marketValue: 4000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [atTarget, below],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("BLW")).toBeCloseTo(1000);
    expect(bySymbol.get("AT")).toBeCloseTo(0);
  });

  it("reason mentions shortfall for underweight bucket", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "rebalance" });
    const reasons = result.allocations.flatMap((a) =>
      a.symbolAllocations.map((s) => s.reason ?? ""),
    );
    const hasShortfall = reasons.some(
      (r) => r.includes("shortfall") || r.includes("at target"),
    );
    expect(hasShortfall).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – opportunity mode
// ---------------------------------------------------------------------------
describe("computeAllocations – opportunity mode", () => {
  const syms: PortfolioSymbol[] = [
    { symbol: "AAPL", instrumentId: 1, marketValue: 5000 },
    { symbol: "GOOG", instrumentId: 3, marketValue: 3000 },
    { symbol: "TSLA", instrumentId: 5, marketValue: 2000 },
  ];

  const metrics = new Map<string, OpportunityMetrics>([
    ["AAPL", makeMetrics(-10)],
    ["GOOG", makeMetrics(-20)],
    ["TSLA", makeMetrics(5)],
  ]);

  it("total allocation equals cashAmount", () => {
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: metrics,
      cashAmount: 900,
    });
    expect(totalAllocated(result)).toBeCloseTo(900);
  });

  it("gives more cash to symbols with more negative metric", () => {
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: metrics,
      cashAmount: 900,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("GOOG")!).toBeGreaterThan(bySymbol.get("AAPL")!);
  });

  it("gives $0 to symbols with positive metric (no discount)", () => {
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: metrics,
      cashAmount: 900,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("TSLA")).toBeCloseTo(0);
  });

  it("falls back to equal split when all metrics are positive", () => {
    const allPositive = new Map<string, OpportunityMetrics>([
      ["AAPL", makeMetrics(5)],
      ["GOOG", makeMetrics(10)],
    ]);
    const twoSyms: PortfolioSymbol[] = [
      { symbol: "AAPL", instrumentId: 1, marketValue: 5000 },
      { symbol: "GOOG", instrumentId: 3, marketValue: 3000 },
    ];
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: twoSyms,
      metricsMap: allPositive,
      cashAmount: 600,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("AAPL")).toBeCloseTo(300);
    expect(bySymbol.get("GOOG")).toBeCloseTo(300);
  });

  it("works without any buckets configured", () => {
    const result = allocate({
      buckets: [],
      totalTargetPercent: 0,
      totalAssignedMarketValue: 0,
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: metrics,
      cashAmount: 300,
    });
    expect(totalAllocated(result)).toBeCloseTo(300);
    expect(result.allocations).toHaveLength(1);
  });

  it("reason includes weight and signal value", () => {
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: metrics,
      cashAmount: 300,
    });
    const sym = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "GOOG",
    )!;
    expect(sym.reason).toContain("weight");
    expect(sym.reason).toContain("signal");
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – exclusion & redistribution
// ---------------------------------------------------------------------------
describe("computeAllocations – exclusions", () => {
  it("excluded symbols get allocation = 0 in target mode", () => {
    const result = allocate({
      allocationMode: "target",
      excludedSymbols: new Set(["AAPL"]),
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("AAPL")).toBeCloseTo(0);
  });

  it("excluded symbol's cash redistributes to others in same bucket", () => {
    const result = allocate({
      allocationMode: "target",
      excludedSymbols: new Set(["AAPL"]),
      cashAmount: 1000,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("MSFT")).toBeCloseTo(600);
    expect(bySymbol.get("GOOG")).toBeCloseTo(200);
    expect(bySymbol.get("AMZN")).toBeCloseTo(200);
    expect(totalAllocated(result)).toBeCloseTo(1000);
  });

  it("excluding all symbols in a bucket redistributes cash to other buckets", () => {
    const result = allocate({
      allocationMode: "target",
      excludedSymbols: new Set(["AAPL", "MSFT"]),
      cashAmount: 1000,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("AAPL")).toBeCloseTo(0);
    expect(bySymbol.get("MSFT")).toBeCloseTo(0);
    expect(bySymbol.get("GOOG")! + bySymbol.get("AMZN")!).toBeCloseTo(1000);
  });

  it("excluded symbols in opportunity mode get $0 and reason 'Excluded'", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "X", instrumentId: 1, marketValue: 1000 },
      { symbol: "Y", instrumentId: 2, marketValue: 1000 },
    ];
    const m = new Map<string, OpportunityMetrics>([
      ["X", makeMetrics(-10)],
      ["Y", makeMetrics(-10)],
    ]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      excludedSymbols: new Set(["X"]),
      cashAmount: 500,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("X")).toBeCloseTo(0);
    expect(bySymbol.get("Y")).toBeCloseTo(500);
    const xAlloc = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "X",
    )!;
    expect(xAlloc.reason).toBe("Excluded");
  });

  it("excluding all symbols returns empty allocations in opportunity mode", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "X", instrumentId: 1, marketValue: 1000 },
    ];
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      excludedSymbols: new Set(["X"]),
      cashAmount: 500,
    });
    expect(result.allocations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – fees
// ---------------------------------------------------------------------------
describe("computeAllocations – fees", () => {
  it("counts only non-excluded symbols with allocation >= $0.01", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    expect(result.fees.orderCount).toBe(4);
    expect(result.fees.totalFees).toBe(4 * FEE_PER_ORDER);
  });

  it("does not count excluded symbols in fee calculation", () => {
    const result = allocate({
      cashAmount: 1000,
      allocationMode: "target",
      excludedSymbols: new Set(["AAPL"]),
    });
    expect(result.fees.orderCount).toBe(3);
  });

  it("zero-allocation symbols are not counted as orders", () => {
    const overweight = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const underweight = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [overweight, underweight],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const ovrAlloc = allocationBySymbol(result).get("OVR")!;
    if (ovrAlloc < 0.01) {
      expect(result.fees.orderCount).toBe(1);
    } else {
      expect(result.fees.orderCount).toBe(2);
    }
  });

  it("fees are $0 when cashAmount is 0", () => {
    const result = allocate({ cashAmount: 0 });
    expect(result.fees.totalFees).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – conservation of cash
// ---------------------------------------------------------------------------
describe("computeAllocations – cash conservation", () => {
  const modes: AllocationMode[] = ["target", "rebalance"];

  for (const mode of modes) {
    it(`total non-excluded allocation equals cashAmount in ${mode} mode`, () => {
      const result = allocate({
        cashAmount: 1234.56,
        allocationMode: mode,
      });
      expect(totalAllocated(result)).toBeCloseTo(1234.56);
    });

    it(`total equals cashAmount even with exclusions in ${mode} mode`, () => {
      const result = allocate({
        cashAmount: 1000,
        allocationMode: mode,
        excludedSymbols: new Set(["GOOG"]),
      });
      expect(totalAllocated(result)).toBeCloseTo(1000);
    });
  }

  it("total equals cashAmount in opportunity mode with exclusions", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "A", instrumentId: 1, marketValue: 1000 },
      { symbol: "B", instrumentId: 2, marketValue: 2000 },
      { symbol: "C", instrumentId: 3, marketValue: 3000 },
    ];
    const m = new Map<string, OpportunityMetrics>([
      ["A", makeMetrics(-5)],
      ["B", makeMetrics(-15)],
      ["C", makeMetrics(-10)],
    ]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      excludedSymbols: new Set(["B"]),
      cashAmount: 750,
    });
    expect(totalAllocated(result)).toBeCloseTo(750);
  });
});

// ---------------------------------------------------------------------------
// buildFlatList
// ---------------------------------------------------------------------------
describe("buildFlatList", () => {
  const metricsMap = new Map<string, OpportunityMetrics>([
    ["AAPL", makeMetrics(-10)],
    ["MSFT", makeMetrics(-5)],
    ["GOOG", makeMetrics(-20)],
    ["AMZN", makeMetrics(3)],
  ]);

  function makeFlatList(
    mode: AllocationMode,
    overrides: Partial<Parameters<typeof computeAllocations>[0]> = {},
  ) {
    const result = allocate({
      allocationMode: mode,
      metricsMap,
      ...overrides,
    });
    return buildFlatList({
      allocations: result.allocations,
      buckets: overrides.buckets ?? buckets,
      allocationMode: mode,
      hasMetrics: true,
      selectedMetric: "diff200MA",
    });
  }

  it("excluded rows sort after active rows", () => {
    const list = makeFlatList("target", {
      excludedSymbols: new Set(["AAPL"]),
    });
    const aaplIdx = list.findIndex((r) => r.symbol === "AAPL");
    const msftIdx = list.findIndex((r) => r.symbol === "MSFT");
    expect(list[aaplIdx].excluded).toBe(true);
    expect(aaplIdx).toBeGreaterThan(msftIdx);
  });

  it("zero-allocation rows sort between active and excluded", () => {
    const overweight = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const underweight = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [overweight, underweight],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const list = buildFlatList({
      allocations: result.allocations,
      buckets: [overweight, underweight],
      allocationMode: "rebalance",
      hasMetrics: false,
      selectedMetric: "diff200MA",
    });
    const ovrRow = list.find((r) => r.symbol === "OVR")!;
    const undRow = list.find((r) => r.symbol === "UND")!;
    if (ovrRow.allocation < 0.01) {
      expect(list.indexOf(ovrRow)).toBeGreaterThan(list.indexOf(undRow));
    }
  });

  it("ranks only active rows (allocation >= 0.01, not excluded)", () => {
    const list = makeFlatList("target", {
      excludedSymbols: new Set(["AAPL"]),
    });
    const ranked = list.filter((r) => r.rank > 0);
    const excluded = list.filter((r) => r.excluded);
    const zero = list.filter((r) => !r.excluded && r.allocation < 0.01);
    for (const r of excluded) expect(r.rank).toBe(0);
    for (const r of zero) expect(r.rank).toBe(0);
    expect(ranked.length).toBeGreaterThan(0);
    const ranks = ranked.map((r) => r.rank);
    expect(ranks).toEqual(ranks.map((_, i) => i + 1));
  });

  it("opportunity mode sorts by metric ascending (most negative first)", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "AAPL", instrumentId: 1, marketValue: 3000 },
      { symbol: "GOOG", instrumentId: 3, marketValue: 2000 },
      { symbol: "AMZN", instrumentId: 4, marketValue: 2000 },
    ];
    const m = new Map<string, OpportunityMetrics>([
      ["AAPL", makeMetrics(-10)],
      ["GOOG", makeMetrics(-20)],
      ["AMZN", makeMetrics(3)],
    ]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      cashAmount: 600,
    });
    const list = buildFlatList({
      allocations: result.allocations,
      buckets: [],
      allocationMode: "opportunity",
      hasMetrics: true,
      selectedMetric: "diff200MA",
    });
    const activeRows = list.filter((r) => r.allocation >= 0.01);
    const zeroRows = list.filter((r) => !r.excluded && r.allocation < 0.01);

    if (activeRows.length >= 2) {
      const vals = activeRows.map((r) => r.metrics?.diff200MA ?? Infinity);
      for (let i = 1; i < vals.length; i++) {
        expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1]);
      }
    }
    for (const z of zeroRows) {
      const lastActive = list.indexOf(activeRows[activeRows.length - 1]);
      expect(list.indexOf(z)).toBeGreaterThan(lastActive);
    }
  });

  it("all rows have bucketName and bucketColor for bucket-based modes", () => {
    const list = makeFlatList("target");
    for (const row of list) {
      expect(row.bucketName).toBeTruthy();
      expect(row.bucketColor).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("edge cases", () => {
  it("single symbol in single bucket gets all cash in target mode", () => {
    const b = makeBucket({
      id: "solo",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "ONLY", instrumentId: 99, marketValue: 5000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 5000,
      cashAmount: 500,
      allocationMode: "target",
    });
    expect(allocationBySymbol(result).get("ONLY")).toBeCloseTo(500);
  });

  it("handles very small cashAmount", () => {
    const result = allocate({ cashAmount: 0.01 });
    expect(totalAllocated(result)).toBeCloseTo(0.01);
  });

  it("handles very large cashAmount", () => {
    const result = allocate({ cashAmount: 1_000_000 });
    expect(totalAllocated(result)).toBeCloseTo(1_000_000);
  });

  it("symbols with 0 marketValue get equal split within bucket", () => {
    const zeroValue = makeBucket({
      id: "z",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "A", instrumentId: 1, marketValue: 0, weight: 0 },
        { symbol: "B", instrumentId: 2, marketValue: 0, weight: 0 },
      ],
    });
    const result = allocate({
      buckets: [zeroValue],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 0,
      cashAmount: 200,
      allocationMode: "target",
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("A")).toBeCloseTo(100);
    expect(bySymbol.get("B")).toBeCloseTo(100);
  });

  it("multiple buckets with same target % get equal cash in target mode", () => {
    const b1 = makeBucket({
      id: "x",
      targetPercent: 50,
      symbolDetails: [
        { symbol: "S1", instrumentId: 10, marketValue: 1000, weight: 100 },
      ],
    });
    const b2 = makeBucket({
      id: "y",
      targetPercent: 50,
      symbolDetails: [
        { symbol: "S2", instrumentId: 11, marketValue: 1000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [b1, b2],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 2000,
      cashAmount: 1000,
      allocationMode: "target",
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("S1")).toBeCloseTo(500);
    expect(bySymbol.get("S2")).toBeCloseTo(500);
  });

  it("opportunity mode with missing metrics for a symbol gives it 0 score", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "HAS", instrumentId: 1, marketValue: 1000 },
      { symbol: "NO", instrumentId: 2, marketValue: 1000 },
    ];
    const m = new Map<string, OpportunityMetrics>([["HAS", makeMetrics(-10)]]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      cashAmount: 300,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("HAS")).toBeCloseTo(300);
    expect(bySymbol.get("NO")).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Richer reason strings
// ---------------------------------------------------------------------------
describe("richer reason strings", () => {
  it("target mode reason includes dollar amounts and weight %", () => {
    const b = makeBucket({
      id: "tech",
      name: "Tech",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "X", instrumentId: 1, marketValue: 750, weight: 75 },
        { symbol: "Y", instrumentId: 2, marketValue: 250, weight: 25 },
      ],
    });
    const result = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 1000,
      cashAmount: 400,
      allocationMode: "target",
    });
    const xReason = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "X",
    )!.reason!;
    expect(xReason).toContain("750");
    expect(xReason).toContain("75.0% weight");
    expect(xReason).toContain("Tech");
  });

  it("rebalance reason shows shortfall dollars and percentage", () => {
    const under = makeBucket({
      id: "u",
      name: "Under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "U1", instrumentId: 1, marketValue: 3000, weight: 100 },
      ],
    });
    const over = makeBucket({
      id: "o",
      name: "Over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "O1", instrumentId: 2, marketValue: 7000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [under, over],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const u1Reason = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "U1")!.reason!;
    expect(u1Reason).toContain("shortfall");
    expect(u1Reason).toContain("$");
  });

  it("overweight bucket reason says overweight with dollar surplus", () => {
    const over = makeBucket({
      id: "o",
      name: "Over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "O1", instrumentId: 2, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "u",
      name: "Under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "U1", instrumentId: 1, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const o1 = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "O1")!;
    expect(o1.allocation).toBeCloseTo(0);
    expect(o1.reason).toContain("overweight");
    expect(o1.reason).toContain("$");
  });

  it("target mode reason includes $ allocation for bucket", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    const reason = result.allocations[0].symbolAllocations[0].reason!;
    expect(reason).toContain("$");
  });

  it("zero-marketValue symbols in target mode show equal split reason", () => {
    const b = makeBucket({
      id: "z",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "A", instrumentId: 1, marketValue: 0, weight: 0 },
        { symbol: "B", instrumentId: 2, marketValue: 0, weight: 0 },
      ],
    });
    const result = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 0,
      cashAmount: 200,
      allocationMode: "target",
    });
    const reason = result.allocations[0].symbolAllocations[0].reason!;
    expect(reason).toContain("Equal split");
    expect(reason).toContain("1/2");
  });
});

// ---------------------------------------------------------------------------
// Overweight bucket visibility
// ---------------------------------------------------------------------------
describe("overweight bucket visibility", () => {
  const over = makeBucket({
    id: "over",
    name: "Overweight",
    targetPercent: 30,
    symbolDetails: [
      { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
    ],
  });
  const under = makeBucket({
    id: "under",
    name: "Underweight",
    targetPercent: 70,
    symbolDetails: [
      { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
    ],
  });

  it("overweight bucket appears in results with $0 allocation", () => {
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const overEntry = result.allocations.find((a) => a.bucketId === "over");
    expect(overEntry).toBeDefined();
    expect(overEntry!.allocation).toBeCloseTo(0);
  });

  it("overweight symbol has informative reason", () => {
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const ovr = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "OVR")!;
    expect(ovr.reason).toContain("overweight");
    expect(ovr.reason).toContain("30%");
  });

  it("fully-excluded overweight bucket shows overweight in reason", () => {
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
      excludedSymbols: new Set(["OVR"]),
    });
    const ovr = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "OVR")!;
    expect(ovr.excluded).toBe(true);
    expect(ovr.reason).toContain("Excluded");
  });
});

// ---------------------------------------------------------------------------
// Minimum order flagging
// ---------------------------------------------------------------------------
describe("minimum order flagging", () => {
  it("flags symbols with allocation between $0 and MIN_ORDER_AMOUNT", () => {
    const b1 = makeBucket({
      id: "tiny",
      targetPercent: 1,
      symbolDetails: [
        { symbol: "TINY", instrumentId: 1, marketValue: 100, weight: 100 },
      ],
    });
    const b2 = makeBucket({
      id: "big",
      targetPercent: 99,
      symbolDetails: [
        { symbol: "BIG", instrumentId: 2, marketValue: 9900, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [b1, b2],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 100,
      allocationMode: "target",
    });
    const tiny = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "TINY")!;
    expect(tiny.allocation).toBeLessThan(MIN_ORDER_AMOUNT);
    expect(tiny.allocation).toBeGreaterThan(0);
    expect(tiny.belowMinimum).toBe(true);
    expect(tiny.reason).toContain("min");
  });

  it("does not flag symbols with allocation >= MIN_ORDER_AMOUNT", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    const allSyms = result.allocations.flatMap((a) => a.symbolAllocations);
    for (const s of allSyms) {
      if (s.allocation >= MIN_ORDER_AMOUNT) {
        expect(s.belowMinimum).toBeFalsy();
      }
    }
  });

  it("does not flag excluded symbols", () => {
    const result = allocate({
      cashAmount: 1000,
      allocationMode: "target",
      excludedSymbols: new Set(["AAPL"]),
    });
    const aapl = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "AAPL")!;
    expect(aapl.excluded).toBe(true);
    expect(aapl.belowMinimum).toBeFalsy();
  });

  it("belowMinCount in fees reflects flagged count", () => {
    const b1 = makeBucket({
      id: "tiny",
      targetPercent: 1,
      symbolDetails: [
        { symbol: "T1", instrumentId: 1, marketValue: 50, weight: 50 },
        { symbol: "T2", instrumentId: 2, marketValue: 50, weight: 50 },
      ],
    });
    const b2 = makeBucket({
      id: "big",
      targetPercent: 99,
      symbolDetails: [
        { symbol: "BIG", instrumentId: 3, marketValue: 9900, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [b1, b2],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 100,
      allocationMode: "target",
    });
    const allSyms = result.allocations.flatMap((a) => a.symbolAllocations);
    const flagged = allSyms.filter((s) => s.belowMinimum);
    expect(result.fees.belowMinCount).toBe(flagged.length);
    expect(result.fees.belowMinCount).toBeGreaterThan(0);
  });

  it("opportunity mode also flags below-minimum symbols", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "A", instrumentId: 1, marketValue: 1000 },
      { symbol: "B", instrumentId: 2, marketValue: 1000 },
    ];
    const m = new Map<string, OpportunityMetrics>([
      ["A", makeMetrics(-1)],
      ["B", makeMetrics(-99)],
    ]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      cashAmount: 11,
    });
    const a = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "A",
    )!;
    if (a.allocation > 0 && a.allocation < MIN_ORDER_AMOUNT) {
      expect(a.belowMinimum).toBe(true);
    }
  });

  it("does not flag $0 allocation symbols", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const ovr = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "OVR")!;
    if (ovr.allocation === 0) {
      expect(ovr.belowMinimum).toBeFalsy();
    }
  });
});

// ---------------------------------------------------------------------------
// Before/after projections
// ---------------------------------------------------------------------------
describe("before/after projections", () => {
  it("returns projections for bucket-based modes", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    expect(result.projections.length).toBe(2);
    for (const p of result.projections) {
      expect(p.bucketName).toBeTruthy();
      expect(p.targetPercent).toBeGreaterThan(0);
      expect(typeof p.beforePercent).toBe("number");
      expect(typeof p.afterPercent).toBe("number");
    }
  });

  it("projections are empty for opportunity mode", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "X", instrumentId: 1, marketValue: 1000 },
    ];
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: new Map([["X", makeMetrics(-10)]]),
      cashAmount: 100,
    });
    expect(result.projections).toHaveLength(0);
  });

  it("projections are empty when cashAmount is 0", () => {
    const result = allocate({ cashAmount: 0 });
    expect(result.projections).toHaveLength(0);
  });

  it("afterPercent moves toward target for underweight buckets in rebalance", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    const underProj = result.projections.find((p) => p.bucketId === "under")!;
    expect(underProj.afterPercent).toBeGreaterThan(underProj.beforePercent);
    const distBefore = Math.abs(
      underProj.beforePercent - underProj.targetPercent,
    );
    const distAfter = Math.abs(
      underProj.afterPercent - underProj.targetPercent,
    );
    expect(distAfter).toBeLessThan(distBefore);
  });

  it("before percentages sum to ~100%", () => {
    const result = allocate({ cashAmount: 500, allocationMode: "target" });
    const totalBefore = result.projections.reduce(
      (s, p) => s + p.beforePercent,
      0,
    );
    expect(totalBefore).toBeCloseTo(100);
  });

  it("after percentages sum to ~100% (approximately, excluding unassigned)", () => {
    const result = allocate({ cashAmount: 500, allocationMode: "target" });
    const totalAfter = result.projections.reduce(
      (s, p) => s + p.afterPercent,
      0,
    );
    expect(totalAfter).toBeCloseTo(100, 0);
  });
});

// ---------------------------------------------------------------------------
// Rebalance progress
// ---------------------------------------------------------------------------
describe("rebalance progress", () => {
  it("returns progress only in rebalance mode", () => {
    const targetResult = allocate({
      cashAmount: 1000,
      allocationMode: "target",
    });
    expect(targetResult.rebalanceProgress).toBeNull();

    const rebalanceResult = allocate({
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    expect(rebalanceResult.rebalanceProgress).not.toBeNull();
  });

  it("progress is between 0 and 100", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "rebalance" });
    expect(result.rebalanceProgress).toBeGreaterThanOrEqual(0);
    expect(result.rebalanceProgress).toBeLessThanOrEqual(100);
  });

  it("more cash leads to higher progress", () => {
    const small = allocate({ cashAmount: 100, allocationMode: "rebalance" });
    const big = allocate({ cashAmount: 5000, allocationMode: "rebalance" });
    expect(big.rebalanceProgress!).toBeGreaterThanOrEqual(
      small.rebalanceProgress!,
    );
  });

  it("progress is 100 when portfolio is already at target", () => {
    const balanced1 = makeBucket({
      id: "a",
      targetPercent: 50,
      symbolDetails: [
        { symbol: "A", instrumentId: 1, marketValue: 5000, weight: 100 },
      ],
    });
    const balanced2 = makeBucket({
      id: "b",
      targetPercent: 50,
      symbolDetails: [
        { symbol: "B", instrumentId: 2, marketValue: 5000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [balanced1, balanced2],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
    });
    expect(result.rebalanceProgress).toBe(100);
  });

  it("progress is null for opportunity mode", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "X", instrumentId: 1, marketValue: 1000 },
    ];
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: new Map([["X", makeMetrics(-10)]]),
      cashAmount: 100,
    });
    expect(result.rebalanceProgress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Signal-weighted within-bucket distribution
// ---------------------------------------------------------------------------
describe("signal-weighted within-bucket distribution", () => {
  const metricsForSignal = new Map<string, OpportunityMetrics>([
    ["AAPL", makeMetrics(-20)],
    ["MSFT", makeMetrics(-5)],
    ["GOOG", makeMetrics(-10)],
    ["AMZN", makeMetrics(5)],
  ]);

  it("signal-weighted gives more to symbols with worse signal", () => {
    const b = makeBucket({
      id: "tech",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "AAPL", instrumentId: 1, marketValue: 3000, weight: 50 },
        { symbol: "MSFT", instrumentId: 2, marketValue: 3000, weight: 50 },
      ],
    });
    const normal = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 6000,
      cashAmount: 600,
      allocationMode: "target",
      metricsMap: metricsForSignal,
    });
    const signal = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 6000,
      cashAmount: 600,
      allocationMode: "target",
      metricsMap: metricsForSignal,
      withinBucketStrategy: "signal-weighted",
    });

    const normalAAPL = allocationBySymbol(normal).get("AAPL")!;
    const normalMSFT = allocationBySymbol(normal).get("MSFT")!;
    expect(normalAAPL).toBeCloseTo(normalMSFT);

    const signalAAPL = allocationBySymbol(signal).get("AAPL")!;
    const signalMSFT = allocationBySymbol(signal).get("MSFT")!;
    expect(signalAAPL).toBeGreaterThan(signalMSFT);
  });

  it("signal-weighted still conserves total cash", () => {
    const result = allocate({
      cashAmount: 1000,
      allocationMode: "target",
      metricsMap: metricsForSignal,
      withinBucketStrategy: "signal-weighted",
    });
    expect(totalAllocated(result)).toBeCloseTo(1000);
  });

  it("falls back to market-value when no metrics available", () => {
    const b = makeBucket({
      id: "tech",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "X", instrumentId: 10, marketValue: 750, weight: 75 },
        { symbol: "Y", instrumentId: 11, marketValue: 250, weight: 25 },
      ],
    });
    const result = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 1000,
      cashAmount: 400,
      allocationMode: "target",
      metricsMap: EMPTY_METRICS,
      withinBucketStrategy: "signal-weighted",
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("X")).toBeCloseTo(300);
    expect(bySymbol.get("Y")).toBeCloseTo(100);
  });

  it("signal-weighted reason mentions signal value", () => {
    const b = makeBucket({
      id: "tech",
      targetPercent: 100,
      symbolDetails: [
        { symbol: "AAPL", instrumentId: 1, marketValue: 3000, weight: 50 },
        { symbol: "MSFT", instrumentId: 2, marketValue: 3000, weight: 50 },
      ],
    });
    const result = allocate({
      buckets: [b],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 6000,
      cashAmount: 600,
      allocationMode: "target",
      metricsMap: metricsForSignal,
      withinBucketStrategy: "signal-weighted",
    });
    const aapl = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "AAPL",
    )!;
    expect(aapl.reason).toContain("signal");
    expect(aapl.reason).toContain("-20");
  });

  it("works in rebalance mode too", () => {
    const result = allocate({
      cashAmount: 1000,
      allocationMode: "rebalance",
      metricsMap: metricsForSignal,
      withinBucketStrategy: "signal-weighted",
    });
    expect(totalAllocated(result)).toBeCloseTo(1000);
    const allReasons = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .filter((s) => !s.excluded && s.allocation > 0)
      .map((s) => s.reason ?? "");
    expect(allReasons.some((r) => r.includes("signal"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – equal mode
// ---------------------------------------------------------------------------
describe("computeAllocations – equal mode", () => {
  const syms: PortfolioSymbol[] = [
    { symbol: "AAPL", instrumentId: 1, marketValue: 5000 },
    { symbol: "GOOG", instrumentId: 3, marketValue: 3000 },
    { symbol: "TSLA", instrumentId: 5, marketValue: 2000 },
  ];

  it("total allocation equals cashAmount", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      cashAmount: 900,
    });
    expect(totalAllocated(result)).toBeCloseTo(900);
  });

  it("splits cash equally regardless of market value", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      cashAmount: 900,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("AAPL")).toBeCloseTo(300);
    expect(bySymbol.get("GOOG")).toBeCloseTo(300);
    expect(bySymbol.get("TSLA")).toBeCloseTo(300);
  });

  it("excluded symbols get $0", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      excludedSymbols: new Set(["TSLA"]),
      cashAmount: 600,
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("TSLA")).toBeCloseTo(0);
    expect(bySymbol.get("AAPL")).toBeCloseTo(300);
    expect(bySymbol.get("GOOG")).toBeCloseTo(300);
  });

  it("excluded symbol's cash redistributes to remaining included symbols", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      excludedSymbols: new Set(["TSLA"]),
      cashAmount: 600,
    });
    expect(totalAllocated(result)).toBeCloseTo(600);
  });

  it("excluding all symbols returns empty allocations", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      excludedSymbols: new Set(["AAPL", "GOOG", "TSLA"]),
      cashAmount: 900,
    });
    expect(result.allocations).toHaveLength(0);
  });

  it("works without any buckets configured", () => {
    const result = allocate({
      buckets: [],
      totalTargetPercent: 0,
      totalAssignedMarketValue: 0,
      allocationMode: "equal",
      allSymbols: syms,
      cashAmount: 300,
    });
    expect(totalAllocated(result)).toBeCloseTo(300);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].bucketId).toBe("__equal__");
  });

  it("returns no projections and no rebalanceProgress", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      cashAmount: 900,
    });
    expect(result.projections).toHaveLength(0);
    expect(result.rebalanceProgress).toBeNull();
  });

  it("reason includes equal split with count", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      cashAmount: 900,
    });
    const sym = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "AAPL",
    )!;
    expect(sym.reason).toContain("Equal split");
    expect(sym.reason).toContain("1/3");
  });

  it("excluded symbol reason is 'Excluded'", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      excludedSymbols: new Set(["GOOG"]),
      cashAmount: 600,
    });
    const goog = result.allocations[0].symbolAllocations.find(
      (s) => s.symbol === "GOOG",
    )!;
    expect(goog.reason).toBe("Excluded");
    expect(goog.excluded).toBe(true);
  });

  it("returns empty when allSymbols is empty", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: [],
      cashAmount: 100,
    });
    expect(result.allocations).toHaveLength(0);
  });

  it("fees count matches included symbols", () => {
    const result = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      cashAmount: 900,
    });
    expect(result.fees.orderCount).toBe(3);
    expect(result.fees.totalFees).toBe(3 * FEE_PER_ORDER);
  });

  it("flags below-minimum symbols", () => {
    const manySyms: PortfolioSymbol[] = Array.from({ length: 20 }, (_, i) => ({
      symbol: `S${i}`,
      instrumentId: i,
      marketValue: 100,
    }));
    const result = allocate({
      allocationMode: "equal",
      allSymbols: manySyms,
      cashAmount: 100,
    });
    const perSym = 100 / 20;
    expect(perSym).toBeLessThan(MIN_ORDER_AMOUNT);
    expect(result.fees.belowMinCount).toBe(20);
  });

  it("single symbol gets all cash", () => {
    const one: PortfolioSymbol[] = [
      { symbol: "ONLY", instrumentId: 1, marketValue: 1000 },
    ];
    const result = allocate({
      allocationMode: "equal",
      allSymbols: one,
      cashAmount: 500,
    });
    expect(allocationBySymbol(result).get("ONLY")).toBeCloseTo(500);
  });
});

// ---------------------------------------------------------------------------
// computeAllocations – forced symbols
// ---------------------------------------------------------------------------
describe("computeAllocations – forced symbols", () => {
  it("forced zero-allocation symbol receives cash in rebalance mode", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
      forcedSymbols: new Set(["OVR"]),
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("OVR")!).toBeGreaterThan(0);
  });

  it("total cash is conserved when forcing zero-allocation symbols", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
      forcedSymbols: new Set(["OVR"]),
    });
    expect(totalAllocated(result)).toBeCloseTo(1000);
  });

  it("forced symbol reason mentions forced inclusion", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
      forcedSymbols: new Set(["OVR"]),
    });
    const ovr = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "OVR")!;
    expect(ovr.reason).toContain("Forced inclusion");
  });

  it("forcing an already-active symbol has no effect", () => {
    const result = allocate({
      cashAmount: 1000,
      allocationMode: "target",
      forcedSymbols: new Set(["AAPL"]),
    });
    const bySymbol = allocationBySymbol(result);
    const normal = allocate({ cashAmount: 1000, allocationMode: "target" });
    const normalBySymbol = allocationBySymbol(normal);
    expect(bySymbol.get("AAPL")).toBeCloseTo(normalBySymbol.get("AAPL")!);
  });

  it("forced symbols work in opportunity mode", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "A", instrumentId: 1, marketValue: 1000 },
      { symbol: "B", instrumentId: 2, marketValue: 1000 },
    ];
    const m = new Map<string, OpportunityMetrics>([
      ["A", makeMetrics(-10)],
      ["B", makeMetrics(5)],
    ]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      cashAmount: 500,
      forcedSymbols: new Set(["B"]),
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("B")!).toBeGreaterThan(0);
    expect(totalAllocated(result)).toBeCloseTo(500);
  });

  it("forced symbols work in equal mode", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "A", instrumentId: 1, marketValue: 1000 },
      { symbol: "B", instrumentId: 2, marketValue: 1000 },
    ];
    const resultWithout = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      excludedSymbols: new Set(["B"]),
      cashAmount: 500,
    });
    expect(allocationBySymbol(resultWithout).get("B")).toBeCloseTo(0);

    const resultWith = allocate({
      allocationMode: "equal",
      allSymbols: syms,
      excludedSymbols: new Set(["B"]),
      forcedSymbols: new Set(["B"]),
      cashAmount: 500,
    });
    // B is excluded, so forced has no effect (excluded overrides forced)
    expect(allocationBySymbol(resultWith).get("B")).toBeCloseTo(0);
  });

  it("forcing does not affect excluded symbols", () => {
    const result = allocate({
      cashAmount: 1000,
      allocationMode: "target",
      excludedSymbols: new Set(["AAPL"]),
      forcedSymbols: new Set(["AAPL"]),
    });
    const aapl = result.allocations
      .flatMap((a) => a.symbolAllocations)
      .find((s) => s.symbol === "AAPL")!;
    expect(aapl.excluded).toBe(true);
    expect(aapl.allocation).toBeCloseTo(0);
  });

  it("multiple forced symbols each receive a share", () => {
    const over1 = makeBucket({
      id: "o1",
      targetPercent: 20,
      symbolDetails: [
        { symbol: "OVR1", instrumentId: 20, marketValue: 5000, weight: 100 },
      ],
    });
    const over2 = makeBucket({
      id: "o2",
      targetPercent: 20,
      symbolDetails: [
        { symbol: "OVR2", instrumentId: 21, marketValue: 5000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 60,
      symbolDetails: [
        { symbol: "UND", instrumentId: 22, marketValue: 2000, weight: 100 },
      ],
    });
    const result = allocate({
      buckets: [over1, over2, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 12000,
      cashAmount: 900,
      allocationMode: "rebalance",
      forcedSymbols: new Set(["OVR1", "OVR2"]),
    });
    const bySymbol = allocationBySymbol(result);
    expect(bySymbol.get("OVR1")!).toBeGreaterThan(0);
    expect(bySymbol.get("OVR2")!).toBeGreaterThan(0);
    expect(totalAllocated(result)).toBeCloseTo(900);
  });
});

// ---------------------------------------------------------------------------
// buildFlatList – forced symbols
// ---------------------------------------------------------------------------
describe("buildFlatList – forced symbols", () => {
  it("marks forced rows with forced: true", () => {
    const syms: PortfolioSymbol[] = [
      { symbol: "A", instrumentId: 1, marketValue: 1000 },
      { symbol: "B", instrumentId: 2, marketValue: 1000 },
    ];
    const m = new Map<string, OpportunityMetrics>([
      ["A", makeMetrics(-10)],
      ["B", makeMetrics(5)],
    ]);
    const result = allocate({
      allocationMode: "opportunity",
      allSymbols: syms,
      metricsMap: m,
      cashAmount: 500,
      forcedSymbols: new Set(["B"]),
    });
    const list = buildFlatList({
      allocations: result.allocations,
      buckets: [],
      allocationMode: "opportunity",
      hasMetrics: true,
      selectedMetric: "diff200MA",
      forcedSymbols: new Set(["B"]),
    });
    const bRow = list.find((r) => r.symbol === "B")!;
    expect(bRow.forced).toBe(true);
  });

  it("non-forced rows do not have forced field set", () => {
    const result = allocate({ cashAmount: 1000, allocationMode: "target" });
    const list = buildFlatList({
      allocations: result.allocations,
      buckets,
      allocationMode: "target",
      hasMetrics: false,
      selectedMetric: "diff200MA",
    });
    for (const row of list) {
      expect(row.forced).toBeFalsy();
    }
  });

  it("forced rows sort between active and zero rows", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
        { symbol: "UND2", instrumentId: 22, marketValue: 0, weight: 0 },
      ],
    });
    const forcedSet = new Set(["OVR"]);
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
      forcedSymbols: forcedSet,
    });
    const list = buildFlatList({
      allocations: result.allocations,
      buckets: [over, under],
      allocationMode: "rebalance",
      hasMetrics: false,
      selectedMetric: "diff200MA",
      forcedSymbols: forcedSet,
    });

    const undIdx = list.findIndex((r) => r.symbol === "UND");
    const ovrIdx = list.findIndex((r) => r.symbol === "OVR");
    const und2Idx = list.findIndex((r) => r.symbol === "UND2");

    // Active rows first, then forced, then zero
    expect(undIdx).toBeLessThan(ovrIdx);
    if (list[und2Idx].allocation < 0.01 && !list[und2Idx].forced) {
      expect(ovrIdx).toBeLessThan(und2Idx);
    }
  });

  it("forced rows still get ranked when they have allocation", () => {
    const over = makeBucket({
      id: "over",
      targetPercent: 30,
      symbolDetails: [
        { symbol: "OVR", instrumentId: 20, marketValue: 7000, weight: 100 },
      ],
    });
    const under = makeBucket({
      id: "under",
      targetPercent: 70,
      symbolDetails: [
        { symbol: "UND", instrumentId: 21, marketValue: 3000, weight: 100 },
      ],
    });
    const forcedSet = new Set(["OVR"]);
    const result = allocate({
      buckets: [over, under],
      totalTargetPercent: 100,
      totalAssignedMarketValue: 10000,
      cashAmount: 1000,
      allocationMode: "rebalance",
      forcedSymbols: forcedSet,
    });
    const list = buildFlatList({
      allocations: result.allocations,
      buckets: [over, under],
      allocationMode: "rebalance",
      hasMetrics: false,
      selectedMetric: "diff200MA",
      forcedSymbols: forcedSet,
    });
    const ovrRow = list.find((r) => r.symbol === "OVR")!;
    if (ovrRow.allocation >= 0.01) {
      expect(ovrRow.rank).toBeGreaterThan(0);
    }
  });
});
