import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";

vi.mock("$env/dynamic/public", () => ({ env: {} }));

const KEYS = { apiKey: "k", userKey: "u" };
const KEYS_STORAGE_KEY = "etoro-api-keys";
const SOURCE_STORAGE_KEY = "etoro-buying-opportunities-source";

const PORTFOLIO_RESPONSE = {
  clientPortfolio: {
    positions: [
      {
        positionID: 1,
        instrumentID: 1001,
        openRate: 100,
        units: 1,
        amount: 100,
        isBuy: true,
        openDateTime: "2025-01-01",
        leverage: 1,
        totalFees: 0,
        initialAmountInDollars: 100,
      },
    ],
    credit: 500,
    ordersForOpen: [
      { amount: 50, mirrorID: 0 },
      { amount: 30, mirrorID: 123 },
    ],
    orders: [{ amount: 20, mirrorID: 0 }],
  },
};

const INSTRUMENT_RESPONSE = {
  InstrumentDisplayDatas: [
    {
      instrumentID: 1001,
      instrumentDisplayName: "Apple",
      symbolFull: "AAPL",
      images: [],
    },
  ],
};

const RATES_RESPONSE = {
  RateDatas: [{ instrumentID: 1001, ask: 151, bid: 150 }],
};

const WATCHLISTS_RESPONSE = {
  watchlists: [
    {
      WatchlistId: "w1",
      Name: "First",
      Items: [{ ItemType: "Instrument", ItemId: 1001 }],
    },
    {
      WatchlistId: "w2",
      Name: "Second",
      Items: [{ ItemType: "Instrument", ItemId: 1001 }],
    },
  ],
};

function mockFetch(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    "trading/info/portfolio": PORTFOLIO_RESPONSE,
    "trade/history": [],
    "market-data/instruments?": INSTRUMENT_RESPONSE,
    "instruments/rates?": RATES_RESPONSE,
    watchlists: WATCHLISTS_RESPONSE,
    "stocks-industries": { stocksIndustries: [] },
    "history/candles": { candles: [] },
  };
  const responses = { ...defaults, ...overrides };
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
    return {
      ok: false,
      json: async () => ({}),
      text: async () => "",
    } as Response;
  });
}

function storeKeys() {
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(KEYS));
}

function getClient() {
  return (window as any).__testClient as ReturnType<
    typeof import("./client-api.svelte").createClientApi
  >;
}

async function mountHarness() {
  const { default: Harness } = await import("./ClientApiTestHarness.svelte");
  render(Harness);
  await tick();
  return getClient();
}

async function waitFor(
  predicate: () => boolean,
  timeout = 2000,
  interval = 20,
) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout)
      throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, interval));
    await tick();
  }
}

describe("client-api integration", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    vi.restoreAllMocks();
    delete (window as any).__testClient;
  });

  describe("default state", () => {
    it("opportunitySource defaults to 'portfolio'", async () => {
      mockFetch();
      const client = await mountHarness();
      expect(client.opportunitySource).toBe("portfolio");
    });
  });

  describe("localStorage persistence", () => {
    it("setOpportunitySource writes to localStorage", async () => {
      mockFetch();
      storeKeys();
      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await tick();

      client.setOpportunitySource("w1");
      await tick();

      expect(localStorage.getItem(SOURCE_STORAGE_KEY)).toBe("w1");
      expect(client.opportunitySource).toBe("w1");
    });

    it("restores stored source on mount when watchlist exists", async () => {
      mockFetch();
      storeKeys();
      localStorage.setItem(SOURCE_STORAGE_KEY, "w2");

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await waitFor(() => client.opportunitySource !== "portfolio");

      expect(client.opportunitySource).toBe("w2");
    });

    it("restores 'portfolio' source when stored as portfolio", async () => {
      mockFetch();
      storeKeys();
      localStorage.setItem(SOURCE_STORAGE_KEY, "portfolio");

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await tick();

      expect(client.opportunitySource).toBe("portfolio");
    });
  });

  describe("stored source fallback", () => {
    it("falls back to first watchlist if stored ID is missing", async () => {
      mockFetch();
      storeKeys();
      localStorage.setItem(SOURCE_STORAGE_KEY, "deleted-wl");

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await waitFor(() => client.opportunitySource !== "portfolio");

      expect(client.opportunitySource).toBe("w1");
      expect(localStorage.getItem(SOURCE_STORAGE_KEY)).toBe("w1");
    });

    it("falls back to 'portfolio' if no watchlists available", async () => {
      mockFetch({ watchlists: { watchlists: [] } });
      storeKeys();
      localStorage.setItem(SOURCE_STORAGE_KEY, "w1");

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await tick();

      expect(client.opportunitySource).toBe("portfolio");
    });
  });

  describe("refresh resets and re-applies", () => {
    it("re-applies stored source after refresh", async () => {
      mockFetch();
      storeKeys();

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await waitFor(() => client.watchlists.length > 0);

      client.setOpportunitySource("w2");
      await tick();
      expect(client.opportunitySource).toBe("w2");

      await client.refresh();
      await tick();

      expect(client.watchlists).toEqual([]);

      await client.loadWatchlists();
      await waitFor(() => client.watchlists.length > 0);
      await waitFor(() => client.opportunitySource === "w2");

      expect(client.opportunitySource).toBe("w2");
    });

    it("calls loadWatchlistData for non-portfolio source after refresh", async () => {
      mockFetch();
      storeKeys();

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await waitFor(() => client.watchlists.length > 0);

      client.setOpportunitySource("w1");
      await tick();

      const fetchCallsBefore = (fetch as Mock).mock.calls.length;

      await client.refresh();
      await tick();
      await client.loadWatchlists();
      await waitFor(() => client.watchlists.length > 0);
      await waitFor(() => client.opportunitySource === "w1");

      const fetchCallsAfter = (fetch as Mock).mock.calls.length;
      expect(fetchCallsAfter).toBeGreaterThan(fetchCallsBefore);

      const watchlistFetches = (fetch as Mock).mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === "string" && args[0].includes("instruments?instrumentIds="),
      );
      expect(watchlistFetches.length).toBeGreaterThan(0);
    });
  });

  describe("clearKeys resets source", () => {
    it("resets opportunitySource to 'portfolio'", async () => {
      mockFetch();
      storeKeys();

      const client = await mountHarness();

      await client.load();
      await tick();
      await client.loadWatchlists();
      await waitFor(() => client.watchlists.length > 0);

      client.setOpportunitySource("w2");
      await tick();
      expect(client.opportunitySource).toBe("w2");

      client.clearKeys();
      await tick();

      expect(client.opportunitySource).toBe("portfolio");
    });
  });
});
