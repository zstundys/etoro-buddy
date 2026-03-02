import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ApiKeys } from "./etoro-api";

const KEYS: ApiKeys = { apiKey: "test-api-key", userKey: "test-user-key" };

function mockLocalStorage() {
  const store = new Map<string, string>();
  const mock: Storage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  });
  return { store, mock };
}

function mockFetch(responses: Record<string, unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          json: async () => body,
          text: async () => JSON.stringify(body),
        } as Response;
      }
    }
    return { ok: false, json: async () => ({}), text: async () => "" } as Response;
  });
}

function freshModule() {
  vi.resetModules();
  return import("./etoro-api");
}

const INSTRUMENT_RESPONSE = {
  InstrumentDisplayDatas: [
    {
      instrumentID: 1001,
      instrumentDisplayName: "Apple",
      symbolFull: "AAPL",
      images: [],
      stocksIndustryID: 10,
    },
    {
      instrumentID: 1002,
      instrumentDisplayName: "Google",
      symbolFull: "GOOGL",
      images: [],
      stocksIndustryID: 20,
    },
  ],
};

const RATES_RESPONSE = {
  RateDatas: [
    { instrumentID: 1001, ask: 151, bid: 150 },
    { instrumentID: 1002, ask: 2801, bid: 2800 },
  ],
};

const INDUSTRIES_RESPONSE = {
  stocksIndustries: [
    { industryID: 10, industryName: "Technology" },
    { industryID: 20, industryName: "Communication" },
  ],
};

const WATCHLISTS_RESPONSE = {
  watchlists: [
    {
      WatchlistId: "w1",
      Name: "My Watchlist",
      Items: [
        { ItemType: "Instrument", ItemId: 1001 },
        { ItemType: "Instrument", ItemId: 1002 },
      ],
    },
  ],
};

describe("etoro-api caching", () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.restoreAllMocks();
  });

  describe("fetchInstruments", () => {
    it("fetches from API on cache miss and caches the result", async () => {
      mockFetch({ "market-data/instruments?": INSTRUMENT_RESPONSE });
      const { fetchInstruments } = await freshModule();

      const result = await fetchInstruments(KEYS, [1001, 1002]);
      expect(result).toHaveLength(2);
      expect(result[0].instrumentId).toBe(1001);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await fetchInstruments(KEYS, [1001, 1002]);
      expect(result2).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("re-fetches if cached data does not cover all requested ids", async () => {
      mockFetch({ "market-data/instruments?": INSTRUMENT_RESPONSE });
      const { fetchInstruments } = await freshModule();

      await fetchInstruments(KEYS, [1001, 1002]);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Request with an id not in cache
      await fetchInstruments(KEYS, [1001, 1002, 9999]);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns [] for empty ids without fetching", async () => {
      mockFetch({});
      const { fetchInstruments } = await freshModule();

      const result = await fetchInstruments(KEYS, []);
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("persists cache across calls with different id order", async () => {
      mockFetch({ "market-data/instruments?": INSTRUMENT_RESPONSE });
      const { fetchInstruments } = await freshModule();

      await fetchInstruments(KEYS, [1002, 1001]);
      expect(fetch).toHaveBeenCalledTimes(1);

      // Same ids, different order — should hit cache
      const result = await fetchInstruments(KEYS, [1001, 1002]);
      expect(result).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchRates", () => {
    it("fetches from API on cache miss and caches the result", async () => {
      mockFetch({ "instruments/rates?": RATES_RESPONSE });
      const { fetchRates } = await freshModule();

      const result = await fetchRates(KEYS, [1001, 1002]);
      expect(result).toHaveLength(2);
      expect(result[0].ask).toBe(151);
      expect(fetch).toHaveBeenCalledTimes(1);

      const result2 = await fetchRates(KEYS, [1001, 1002]);
      expect(result2).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("re-fetches if cached data does not cover all requested ids", async () => {
      mockFetch({ "instruments/rates?": RATES_RESPONSE });
      const { fetchRates } = await freshModule();

      await fetchRates(KEYS, [1001]);
      expect(fetch).toHaveBeenCalledTimes(1);

      await fetchRates(KEYS, [1001, 1002]);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns [] for empty ids without fetching", async () => {
      mockFetch({});
      const { fetchRates } = await freshModule();

      const result = await fetchRates(KEYS, []);
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe("fetchStocksIndustries", () => {
    it("fetches from API on cache miss and caches the result", async () => {
      mockFetch({ "stocks-industries": INDUSTRIES_RESPONSE });
      const { fetchStocksIndustries } = await freshModule();

      const result = await fetchStocksIndustries(KEYS);
      expect(result.size).toBe(2);
      expect(result.get(10)).toBe("Technology");
      expect(fetch).toHaveBeenCalledTimes(1);

      const result2 = await fetchStocksIndustries(KEYS);
      expect(result2.size).toBe(2);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchWatchlists", () => {
    it("fetches from API on cache miss and caches the result", async () => {
      mockFetch({ watchlists: WATCHLISTS_RESPONSE });
      const { fetchWatchlists } = await freshModule();

      const result = await fetchWatchlists(KEYS);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("My Watchlist");
      expect(result[0].instrumentIds).toEqual([1001, 1002]);
      expect(fetch).toHaveBeenCalledTimes(1);

      const result2 = await fetchWatchlists(KEYS);
      expect(result2).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidateAll", () => {
    it("clears all caches so next call fetches from API again", async () => {
      mockFetch({
        "market-data/instruments?": INSTRUMENT_RESPONSE,
        "instruments/rates?": RATES_RESPONSE,
        "stocks-industries": INDUSTRIES_RESPONSE,
        watchlists: WATCHLISTS_RESPONSE,
      });
      const {
        fetchInstruments,
        fetchRates,
        fetchStocksIndustries,
        fetchWatchlists,
      } = await freshModule();
      const { invalidateAll } = await import("./api-cache");

      await fetchInstruments(KEYS, [1001, 1002]);
      await fetchRates(KEYS, [1001, 1002]);
      await fetchStocksIndustries(KEYS);
      await fetchWatchlists(KEYS);
      expect(fetch).toHaveBeenCalledTimes(4);

      invalidateAll();

      await fetchInstruments(KEYS, [1001, 1002]);
      await fetchRates(KEYS, [1001, 1002]);
      await fetchStocksIndustries(KEYS);
      await fetchWatchlists(KEYS);
      expect(fetch).toHaveBeenCalledTimes(8);
    });
  });
});
