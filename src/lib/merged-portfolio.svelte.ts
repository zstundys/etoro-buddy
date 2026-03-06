import {
  searchInstrumentBySymbol,
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

export function createMergedPortfolio(
  client: ClientApi,
  manual: ManualHoldingsStore,
) {
  let manualRates = $state<Map<number, number>>(new Map());
  let manualCandles = $state<Map<number, Candle[]>>(new Map());
  let resolving = $state(false);
  let resolved = $state(false);

  const manualPositions = $derived<EnrichedPosition[]>(
    manual.holdings.map((h) => {
      const rate = h.instrumentId ? manualRates.get(h.instrumentId) : undefined;
      return toEnrichedPosition(h, rate);
    }),
  );

  const etoroPositions = $derived<EnrichedPosition[]>(
    client.portfolio?.positions ?? [],
  );

  const positions = $derived<EnrichedPosition[]>([
    ...etoroPositions,
    ...manualPositions,
  ]);

  const totalInvested = $derived(
    (client.portfolio?.totalInvested ?? 0) +
      manualPositions.reduce((s, p) => s + p.amount, 0),
  );

  const totalPnl = $derived(
    (client.portfolio?.totalPnl ?? 0) +
      manualPositions.reduce((s, p) => s + (p.pnl ?? 0), 0),
  );

  const hasData = $derived(
    positions.length > 0,
  );

  const portfolio = $derived<PortfolioData | null>(
    client.portfolio || manualPositions.length > 0
      ? {
          positions,
          pendingOrders: client.portfolio?.pendingOrders ?? [],
          credit: client.portfolio?.credit ?? 0,
          availableCash: client.portfolio?.availableCash ?? 0,
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
        const [rates, candles] = await Promise.all([
          fetchRates(keys, instrumentIds),
          fetchAllCandles(keys, instrumentIds, 250),
        ]);

        const rateMap = new Map<number, number>();
        for (const r of rates) {
          rateMap.set(r.instrumentId, r.bid);
        }
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
    manualCandles = new Map();
    resolveAndFetchRates();
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
      return manualCandles;
    },
    get resolving() {
      return resolving;
    },
    get resolved() {
      return resolved;
    },
    resolveAndFetchRates,
    refresh,
  };
}

export type MergedPortfolio = ReturnType<typeof createMergedPortfolio>;
