import { PALETTE } from "$lib/chart-utils";
import { groupBySymbol, type SymbolSummary } from "$lib/chart-utils";
import type { EnrichedPosition } from "$lib/etoro-api";

const STORAGE_KEY = "target-allocation-config";

export type BucketConfig = {
  id: string;
  name: string;
  targetPercent: number;
  symbols: string[];
  color?: string;
};

export type SymbolDetail = {
  symbol: string;
  instrumentId: number;
  marketValue: number;
  weight: number;
};

export type BucketComputed = BucketConfig & {
  actualPercent: number;
  delta: number;
  marketValue: number;
  symbolDetails: SymbolDetail[];
};

export const THRESHOLD = 0.5;

export function bucketColor(bucket: BucketConfig, index: number): string {
  return bucket.color || PALETTE[index % PALETTE.length];
}

function loadBuckets(): BucketConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

function saveBuckets(b: BucketConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

export function createBucketStore(getPositions: () => EnrichedPosition[]) {
  let buckets = $state<BucketConfig[]>(loadBuckets());

  function persist() {
    saveBuckets(buckets);
  }

  const symbolGroups: SymbolSummary[] = $derived(groupBySymbol(getPositions()));

  const symbolMarketValues = $derived.by(() => {
    const map = new Map<string, number>();
    for (const g of symbolGroups) {
      map.set(g.symbol, g.totalAmount + g.totalPnl);
    }
    return map;
  });

  const symbolInstrumentIds = $derived.by(() => {
    const map = new Map<string, number>();
    for (const g of symbolGroups) {
      const first = g.positions[0];
      if (first) map.set(g.symbol, first.instrumentId);
    }
    return map;
  });

  const assignedSymbols = $derived.by(() => {
    const set = new Set<string>();
    for (const b of buckets) {
      for (const s of b.symbols) set.add(s);
    }
    return set;
  });

  const unassignedCount = $derived(
    symbolGroups.filter((g) => !assignedSymbols.has(g.symbol)).length,
  );

  const availableSymbols = $derived(
    symbolGroups
      .map((g) => g.symbol)
      .filter((s) => !assignedSymbols.has(s))
      .sort(),
  );

  const totalTargetPercent = $derived(
    buckets.reduce((s, b) => s + b.targetPercent, 0),
  );

  const totalAssignedMarketValue = $derived.by(() => {
    let total = 0;
    for (const b of buckets) {
      for (const sym of b.symbols) {
        total += symbolMarketValues.get(sym) ?? 0;
      }
    }
    return total;
  });

  const computed: BucketComputed[] = $derived.by(() => {
    return buckets.map((b) => {
      let mv = 0;
      const details: SymbolDetail[] = [];
      for (const sym of b.symbols) {
        const val = symbolMarketValues.get(sym) ?? 0;
        mv += val;
        details.push({
          symbol: sym,
          instrumentId: symbolInstrumentIds.get(sym) ?? 0,
          marketValue: val,
          weight: 0,
        });
      }
      for (const d of details) {
        d.weight = mv > 0 ? (d.marketValue / mv) * 100 : 0;
      }
      const actualPercent =
        totalAssignedMarketValue > 0
          ? (mv / totalAssignedMarketValue) * 100
          : 0;
      return {
        ...b,
        actualPercent,
        delta: actualPercent - b.targetPercent,
        marketValue: mv,
        symbolDetails: details,
      };
    });
  });

  function addBucket() {
    buckets.push({
      id: crypto.randomUUID(),
      name: "",
      targetPercent: 0,
      symbols: [],
    });
    persist();
  }

  function removeBucket(id: string) {
    buckets = buckets.filter((b) => b.id !== id);
    persist();
  }

  function updateBucketName(id: string, name: string) {
    const b = buckets.find((b) => b.id === id);
    if (b) b.name = name;
    persist();
  }

  function updateBucketTarget(id: string, value: string) {
    const b = buckets.find((b) => b.id === id);
    if (!b) return;
    const n = parseFloat(value);
    b.targetPercent = isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
    persist();
  }

  function addSymbolToBucket(id: string, symbol: string) {
    if (!symbol) return;
    const b = buckets.find((b) => b.id === id);
    if (b && !b.symbols.includes(symbol)) {
      b.symbols.push(symbol);
      persist();
    }
  }

  function removeSymbolFromBucket(id: string, symbol: string) {
    const b = buckets.find((b) => b.id === id);
    if (b) {
      b.symbols = b.symbols.filter((s) => s !== symbol);
      persist();
    }
  }

  function updateBucketColor(id: string, color: string) {
    const b = buckets.find((b) => b.id === id);
    if (b) b.color = color;
    persist();
  }

  return {
    get buckets() {
      return buckets;
    },
    get computed() {
      return computed;
    },
    get totalTargetPercent() {
      return totalTargetPercent;
    },
    get totalAssignedMarketValue() {
      return totalAssignedMarketValue;
    },
    get availableSymbols() {
      return availableSymbols;
    },
    get unassignedCount() {
      return unassignedCount;
    },
    addBucket,
    removeBucket,
    updateBucketName,
    updateBucketTarget,
    addSymbolToBucket,
    removeSymbolFromBucket,
    updateBucketColor,
  };
}

export type BucketStore = ReturnType<typeof createBucketStore>;
