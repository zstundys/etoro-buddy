import {
  searchInstrumentBySymbol,
  fetchInstruments,
  fetchRates,
  fetchAllCandles,
  type ApiKeys,
  type Candle,
  type EnrichedPosition,
  type PortfolioData,
} from "./etoro-api";
import {
  toEnrichedPosition,
  type ManualHoldingsStore,
} from "./manual-holdings.svelte";

type ClientApi = {
  readonly keys: ApiKeys | null;
  readonly hasKeys: boolean;
  readonly portfolio: PortfolioData | null;
};

export type PositionFilter = "both" | "etoro" | "manual";

const FILTER_KEY = "position-filter";
const VALID_FILTERS: PositionFilter[] = ["both", "etoro", "manual"];

function readFilter(): PositionFilter {
  if (typeof localStorage === "undefined") return "both";
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    return raw && VALID_FILTERS.includes(raw as PositionFilter)
      ? (raw as PositionFilter)
      : "both";
  } catch {
    return "both";
  }
}

function writeFilter(value: PositionFilter): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FILTER_KEY, value);
  } catch {
    /* quota exceeded */
  }
}

export function createMergedPortfolio(
  client: ClientApi,
  manual: ManualHoldingsStore,
) {
  let manualRates = $state<Map<number, number>>(new Map());
  let manualLogos = $state<Map<number, string>>(new Map());
  let manualCandles = $state<Map<number, Candle[]>>(new Map());
  let resolving = $state(false);
  let resolved = $state(false);
  let filter = $state<PositionFilter>(readFilter());

  const manualPositions = $derived<EnrichedPosition[]>(
    manual.holdings.map((h) => {
      const rate = h.instrumentId ? manualRates.get(h.instrumentId) : undefined;
      const logo = h.instrumentId ? manualLogos.get(h.instrumentId) : undefined;
      return toEnrichedPosition(h, rate, logo);
    }),
  );

  const etoroPositions = $derived<EnrichedPosition[]>(
    client.portfolio?.positions ?? [],
  );

  const includeEtoro = $derived(filter === "both" || filter === "etoro");
  const includeManual = $derived(filter === "both" || filter === "manual");

  const positions = $derived<EnrichedPosition[]>([
    ...(includeEtoro ? etoroPositions : []),
    ...(includeManual ? manualPositions : []),
  ]);

  const totalInvested = $derived(
    (includeEtoro ? (client.portfolio?.totalInvested ?? 0) : 0) +
      (includeManual ? manualPositions.reduce((s, p) => s + p.amount, 0) : 0),
  );

  const totalPnl = $derived(
    (includeEtoro ? (client.portfolio?.totalPnl ?? 0) : 0) +
      (includeManual
        ? manualPositions.reduce((s, p) => s + (p.pnl ?? 0), 0)
        : 0),
  );

  const hasData = $derived(positions.length > 0);

  const portfolio = $derived<PortfolioData | null>(
    (includeEtoro && client.portfolio) ||
      (includeManual && manualPositions.length > 0)
      ? {
          positions,
          pendingOrders: includeEtoro
            ? (client.portfolio?.pendingOrders ?? [])
            : [],
          credit: includeEtoro ? (client.portfolio?.credit ?? 0) : 0,
          availableCash: includeEtoro
            ? (client.portfolio?.availableCash ?? 0)
            : 0,
          totalInvested,
          totalPnl,
        }
      : null,
  );

  async function resolveAndFetchRates() {
    const keys = client.keys;
    if (!keys || resolving) return;
    resolving = true;

    try {
      const unresolved = manual.holdings.filter((h) => h.instrumentId == null);
      if (unresolved.length > 0) {
        const results = await Promise.all(
          unresolved.map((h) => searchInstrumentBySymbol(keys, h.symbol)),
        );
        for (let i = 0; i < unresolved.length; i++) {
          const result = results[i];
          if (result) {
            manual.update(unresolved[i].id, {
              instrumentId: result.instrumentId,
            });
          }
        }
      }

      // Re-read holdings after potential instrumentId updates above
      const instrumentIds = [
        ...new Set(
          manual.holdings
            .map((h) => h.instrumentId)
            .filter((id): id is number => id != null && id > 0),
        ),
      ];

      if (instrumentIds.length > 0) {
        const [instruments, rates, candles] = await Promise.all([
          fetchInstruments(keys, instrumentIds),
          fetchRates(keys, instrumentIds),
          fetchAllCandles(keys, instrumentIds),
        ]);

        const logoMap = new Map<number, string>();
        for (const inst of instruments) {
          if (inst.logoUrl) logoMap.set(inst.instrumentId, inst.logoUrl);
        }
        const rateMap = new Map<number, number>();
        for (const r of rates) {
          rateMap.set(r.instrumentId, r.bid);
        }
        manualLogos = logoMap;
        manualRates = rateMap;
        manualCandles = candles;
      }

      resolved = true;
    } catch {
      /* non-critical */
    } finally {
      resolving = false;
    }
  }

  function refresh() {
    resolved = false;
    manualRates = new Map();
    manualLogos = new Map();
    manualCandles = new Map();
    resolveAndFetchRates();
  }

  function setFilter(value: PositionFilter) {
    filter = value;
    writeFilter(value);
  }

  return {
    get positions() {
      return positions;
    },
    get etoroPositions() {
      return etoroPositions;
    },
    get manualPositions() {
      return manualPositions;
    },
    get totalInvested() {
      return totalInvested;
    },
    get totalPnl() {
      return totalPnl;
    },
    get hasData() {
      return hasData;
    },
    get portfolio() {
      return portfolio;
    },
    get candles() {
      return includeManual ? manualCandles : new Map();
    },
    get resolving() {
      return resolving;
    },
    get resolved() {
      return resolved;
    },
    get filter() {
      return filter;
    },
    setFilter,
    resolveAndFetchRates,
    refresh,
  };
}

export type MergedPortfolio = ReturnType<typeof createMergedPortfolio>;
