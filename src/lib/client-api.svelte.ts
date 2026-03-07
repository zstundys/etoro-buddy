import {
  fetchPortfolio,
  fetchTradeHistory,
  fetchAllCandles,
  fetchInstruments,
  fetchStocksIndustries,
  fetchWatchlists as apiFetchWatchlists,
  fetchWatchlistInstruments,
  type PortfolioData,
  type EnrichedTrade,
  type ApiKeys,
  type Candle,
  type Watchlist,
  type InstrumentSnapshot,
} from "./etoro-api";
import { createCache, invalidateAll } from "./api-cache";
import { env } from "$env/dynamic/public";

const STORAGE_KEY = "etoro-api-keys";
const LAST_LOADED_KEY = "etoro-last-loaded";
const OPPORTUNITY_SOURCE_KEY = "etoro-buying-opportunities-source";

function getStoredSource(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(OPPORTUNITY_SOURCE_KEY);
  } catch {
    return null;
  }
}

function setStoredSource(source: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OPPORTUNITY_SOURCE_KEY, source);
  } catch {
    /* ignore */
  }
}

const portfolioCache = createCache<PortfolioData>({ key: "etoro-portfolio" });
const tradesCache = createCache<EnrichedTrade[]>({ key: "etoro-trades" });

const ENV_FALLBACK_KEYS: ApiKeys | null =
  env.PUBLIC_ETORO_API_KEY && env.PUBLIC_ETORO_USER_KEY
    ? { apiKey: env.PUBLIC_ETORO_API_KEY, userKey: env.PUBLIC_ETORO_USER_KEY }
    : null;

function readKeys(): ApiKeys | null {
  if (typeof localStorage === "undefined") return ENV_FALLBACK_KEYS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ENV_FALLBACK_KEYS;
    const parsed = JSON.parse(raw);
    if (parsed?.apiKey && parsed?.userKey) return parsed;
    return ENV_FALLBACK_KEYS;
  } catch {
    return ENV_FALLBACK_KEYS;
  }
}

function writeKeys(keys: ApiKeys | null) {
  if (typeof localStorage === "undefined") return;
  if (keys) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function readLastLoaded(): Date | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LAST_LOADED_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function writeLastLoaded(date: Date | null) {
  if (typeof localStorage === "undefined") return;
  if (date) {
    localStorage.setItem(LAST_LOADED_KEY, date.toISOString());
  } else {
    localStorage.removeItem(LAST_LOADED_KEY);
  }
}

export function createClientApi() {
  const hasApiKeys = readKeys() !== null;
  const rawCached = hasApiKeys ? portfolioCache.get() : null;
  const cachedPortfolio = rawCached
    ? {
        ...rawCached,
        availableCash: rawCached.availableCash ?? rawCached.credit,
        pendingOrders: rawCached.pendingOrders ?? [],
      }
    : null;
  const cachedTrades = hasApiKeys ? tradesCache.get() : null;

  let keys = $state<ApiKeys | null>(readKeys());
  let portfolio = $state<PortfolioData | null>(cachedPortfolio);
  let trades = $state<EnrichedTrade[]>(cachedTrades ?? []);
  let loading = $state(false);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let lastLoaded = $state<Date | null>(readLastLoaded());
  let fromCache = $state(cachedPortfolio !== null);
  let candles = $state<Map<number, Candle[]>>(new Map());
  let candlesLoading = $state(false);
  let candlesLoadAttempted = $state(false);
  let sectorMap = $state<Map<number, string>>(new Map());
  let sectorMapLoading = $state(false);
  let sectorMapLoaded = $state(false);
  let watchlists = $state<Watchlist[]>([]);
  let watchlistsLoaded = $state(false);
  let watchlistInstruments = $state<InstrumentSnapshot[]>([]);
  let watchlistCandles = $state<Map<number, Candle[]>>(new Map());
  let watchlistLoading = $state(false);
  let opportunitySource = $state("portfolio");
  let hasAppliedStoredSource = $state(false);

  const hasKeys = $derived(keys !== null);

  function saveKeys(apiKey: string, userKey: string) {
    const newKeys = { apiKey: apiKey.trim(), userKey: userKey.trim() };
    writeKeys(newKeys);
    keys = newKeys;
  }

  function clearKeys() {
    writeKeys(null);
    keys = null;
    portfolio = null;
    trades = [];
    error = null;
    lastLoaded = null;
    writeLastLoaded(null);
    invalidateAll();
    opportunitySource = "portfolio";
    hasAppliedStoredSource = false;
    watchlists = [];
    watchlistsLoaded = false;
    watchlistInstruments = [];
    watchlistCandles = new Map();
    candles = new Map();
    candlesLoadAttempted = false;
    sectorMap = new Map();
    sectorMapLoaded = false;
    setStoredSource("portfolio");
  }

  async function load() {
    if (!keys) return;
    if (portfolio !== null) return;
    loading = true;
    error = null;
    try {
      const [p, t] = await Promise.all([
        fetchPortfolio(keys),
        fetchTradeHistory(keys, 90).catch(() => [] as EnrichedTrade[]),
      ]);
      portfolio = p;
      trades = t;
      fromCache = false;
      const now = new Date();
      lastLoaded = now;
      writeLastLoaded(now);
      portfolioCache.set(p);
      tradesCache.set(t);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load data";
      portfolio = null;
      trades = [];
    } finally {
      loading = false;
    }
  }

  async function loadCandles() {
    if (!keys || !portfolio || candlesLoading || candlesLoadAttempted) return;
    const ids = [...new Set(portfolio.positions.map((p) => p.instrumentId))];
    if (ids.length === 0) return;
    candlesLoadAttempted = true;
    candlesLoading = true;
    try {
      candles = await fetchAllCandles(keys, ids);
    } catch {
      /* non-critical */
    } finally {
      candlesLoading = false;
    }
  }

  async function loadSectorMap() {
    if (!keys || !portfolio || sectorMapLoading || sectorMapLoaded) return;
    sectorMapLoading = true;
    try {
      const ids = [...new Set(portfolio.positions.map((p) => p.instrumentId))];
      const [instruments, industries] = await Promise.all([
        fetchInstruments(keys, ids),
        fetchStocksIndustries(keys),
      ]);
      const result = new Map<number, string>();
      for (const inst of instruments) {
        if (inst.stocksIndustryId != null) {
          const name = industries.get(inst.stocksIndustryId);
          if (name) result.set(inst.instrumentId, name);
        }
      }
      sectorMap = result;
      sectorMapLoaded = true;
    } catch {
      sectorMapLoaded = true;
    } finally {
      sectorMapLoading = false;
    }
  }

  async function loadWatchlists() {
    if (!keys || watchlistsLoaded) return;
    try {
      watchlists = await apiFetchWatchlists(keys);
      watchlistsLoaded = true;
    } catch {
      watchlistsLoaded = true;
    }
  }

  async function loadWatchlistData(watchlistId: string) {
    if (!keys || watchlistLoading) return;
    const wl = watchlists.find((w) => w.id === watchlistId);
    if (!wl || wl.instrumentIds.length === 0) return;
    watchlistLoading = true;
    watchlistInstruments = [];
    watchlistCandles = new Map();
    try {
      const instruments = await fetchWatchlistInstruments(
        keys,
        wl.instrumentIds,
      );
      watchlistInstruments = instruments;
      const ids = instruments.map((i) => i.instrumentId);
      if (ids.length > 0) {
        watchlistCandles = await fetchAllCandles(keys, ids);
      }
    } catch {
      watchlistInstruments = [];
      watchlistCandles = new Map();
    } finally {
      watchlistLoading = false;
    }
  }

  function setOpportunitySource(source: string) {
    opportunitySource = source;
    setStoredSource(source);
    if (source !== "portfolio") {
      loadWatchlistData(source);
    }
  }

  $effect(() => {
    if (watchlists.length === 0) return;

    if (!hasAppliedStoredSource) {
      hasAppliedStoredSource = true;
      const stored = getStoredSource();
      if (stored === "portfolio") {
        opportunitySource = "portfolio";
        return;
      }
      if (stored && watchlists.some((w) => w.id === stored)) {
        opportunitySource = stored;
        loadWatchlistData(stored);
        return;
      }
      const fallback =
        watchlists.length > 0 ? watchlists[0].id : "portfolio";
      opportunitySource = fallback;
      setStoredSource(fallback);
      if (fallback !== "portfolio") {
        loadWatchlistData(fallback);
      }
      return;
    }

    if (opportunitySource === "portfolio") return;
    if (watchlists.some((w) => w.id === opportunitySource)) return;

    const fallback =
      watchlists.length > 0 ? watchlists[0].id : "portfolio";
    opportunitySource = fallback;
    setStoredSource(fallback);
    if (fallback !== "portfolio") {
      loadWatchlistData(fallback);
    }
  });

  async function refresh() {
    if (!keys || refreshing || loading) return;
    refreshing = true;
    invalidateAll();
    candlesLoadAttempted = false;
    watchlistsLoaded = false;
    sectorMapLoaded = false;
    hasAppliedStoredSource = false;
    watchlists = [];
    sectorMap = new Map();
    try {
      const [p, t] = await Promise.all([
        fetchPortfolio(keys),
        fetchTradeHistory(keys, 90).catch(() => [] as EnrichedTrade[]),
      ]);
      portfolio = p;
      trades = t;
      fromCache = false;
      error = null;
      const now = new Date();
      lastLoaded = now;
      writeLastLoaded(now);
      portfolioCache.set(p);
      tradesCache.set(t);
      candles = new Map();
      watchlistCandles = new Map();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to refresh data";
    } finally {
      refreshing = false;
    }
  }

  return {
    get keys() {
      return keys;
    },
    get hasKeys() {
      return hasKeys;
    },
    get portfolio() {
      return portfolio;
    },
    get trades() {
      return trades;
    },
    get loading() {
      return loading;
    },
    get refreshing() {
      return refreshing;
    },
    get error() {
      return error;
    },
    get lastLoaded() {
      return lastLoaded;
    },
    get fromCache() {
      return fromCache;
    },
    get candles() {
      return candles;
    },
    get candlesLoading() {
      return candlesLoading;
    },
    get sectorMap() {
      return sectorMap;
    },
    get watchlists() {
      return watchlists;
    },
    get watchlistInstruments() {
      return watchlistInstruments;
    },
    get watchlistCandles() {
      return watchlistCandles;
    },
    get watchlistLoading() {
      return watchlistLoading;
    },
    get opportunitySource() {
      return opportunitySource;
    },
    saveKeys,
    clearKeys,
    load,
    loadCandles,
    loadSectorMap,
    loadWatchlists,
    loadWatchlistData,
    setOpportunitySource,
    refresh,
  };
}
