import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import type { PortfolioData } from "./etoro-api";
import type { MergedPortfolio } from "./merged-portfolio.svelte";
import type { ManualHoldingsStore } from "./manual-holdings.svelte";

const FILTER_KEY = "position-filter";

const ETORO_PORTFOLIO: PortfolioData = {
  positions: [
    {
      positionId: 1,
      instrumentId: 1001,
      openRate: 100,
      units: 2,
      amount: 200,
      isBuy: true,
      openDateTime: "2025-01-01",
      leverage: 1,
      totalFees: -5,
      initialAmountInDollars: 200,
      symbol: "AAPL",
      displayName: "Apple",
      currentRate: 110,
      pnl: 20,
      pnlPercent: 10,
    },
  ],
  pendingOrders: [],
  credit: 1000,
  availableCash: 800,
  totalInvested: 200,
  totalPnl: 20,
};

function getMerged() {
  return (window as any).__testMerged as MergedPortfolio;
}

function getManualStore() {
  return (window as any).__testManualStore as ManualHoldingsStore;
}

async function mountHarness(clientPortfolio: PortfolioData | null = null) {
  const { default: Harness } = await import(
    "./MergedPortfolioTestHarness.svelte"
  );
  render(Harness, { props: { clientPortfolio } });
  await tick();
  return { merged: getMerged(), manualStore: getManualStore() };
}

describe("merged-portfolio position filter", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    vi.restoreAllMocks();
    delete (window as any).__testMerged;
    delete (window as any).__testManualStore;
  });

  describe("default state", () => {
    it("defaults to 'both'", async () => {
      const { merged } = await mountHarness();
      expect(merged.filter).toBe("both");
    });

    it("restores saved filter from localStorage", async () => {
      localStorage.setItem(FILTER_KEY, "etoro");
      const { merged } = await mountHarness();
      expect(merged.filter).toBe("etoro");
    });

    it("falls back to 'both' for invalid localStorage value", async () => {
      localStorage.setItem(FILTER_KEY, "invalid-value");
      const { merged } = await mountHarness();
      expect(merged.filter).toBe("both");
    });
  });

  describe("setFilter", () => {
    it("updates filter reactively", async () => {
      const { merged } = await mountHarness();
      merged.setFilter("etoro");
      await tick();
      expect(merged.filter).toBe("etoro");
    });

    it("persists to localStorage", async () => {
      const { merged } = await mountHarness();
      merged.setFilter("manual");
      expect(localStorage.getItem(FILTER_KEY)).toBe("manual");
    });

    it("can cycle through all filter values", async () => {
      const { merged } = await mountHarness();
      for (const value of ["etoro", "manual", "both"] as const) {
        merged.setFilter(value);
        await tick();
        expect(merged.filter).toBe(value);
        expect(localStorage.getItem(FILTER_KEY)).toBe(value);
      }
    });
  });

  describe("positions filtering", () => {
    it("'both' includes eToro and manual positions", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 300,
        units: 1,
      });
      await tick();

      expect(merged.filter).toBe("both");
      expect(merged.positions.length).toBe(2);
      expect(merged.etoroPositions.length).toBe(1);
      expect(merged.manualPositions.length).toBe(1);
    });

    it("'etoro' excludes manual positions", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 300,
        units: 1,
      });
      await tick();

      merged.setFilter("etoro");
      await tick();

      expect(merged.positions.length).toBe(1);
      expect(merged.positions[0].symbol).toBe("AAPL");
    });

    it("'manual' excludes eToro positions", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 300,
        units: 1,
      });
      await tick();

      merged.setFilter("manual");
      await tick();

      expect(merged.positions.length).toBe(1);
      expect(merged.positions[0].symbol).toBe("MSFT");
    });
  });

  describe("totals filtering", () => {
    it("'both' sums eToro and manual totals", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 50,
        units: 2,
      });
      await tick();

      expect(merged.totalInvested).toBe(200 + 100);
      expect(merged.totalPnl).toBe(20);
    });

    it("'etoro' uses only eToro totals", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 50,
        units: 2,
      });
      await tick();

      merged.setFilter("etoro");
      await tick();

      expect(merged.totalInvested).toBe(200);
      expect(merged.totalPnl).toBe(20);
    });

    it("'manual' uses only manual totals", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 50,
        units: 2,
      });
      await tick();

      merged.setFilter("manual");
      await tick();

      expect(merged.totalInvested).toBe(100);
      expect(merged.totalPnl).toBe(0);
    });
  });

  describe("portfolio object filtering", () => {
    it("'etoro' zeroes out manual cash/credit fields", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 50,
        units: 2,
      });
      await tick();

      merged.setFilter("etoro");
      await tick();

      const p = merged.portfolio!;
      expect(p.availableCash).toBe(800);
      expect(p.credit).toBe(1000);
    });

    it("'manual' zeroes out eToro cash/credit/pendingOrders", async () => {
      const { merged, manualStore } = await mountHarness(ETORO_PORTFOLIO);
      manualStore.add({
        symbol: "MSFT",
        buyDate: "2025-02-01",
        buyPrice: 50,
        units: 2,
      });
      await tick();

      merged.setFilter("manual");
      await tick();

      const p = merged.portfolio!;
      expect(p.availableCash).toBe(0);
      expect(p.credit).toBe(0);
      expect(p.pendingOrders).toEqual([]);
    });

    it("portfolio is null when filter excludes all data", async () => {
      const { merged } = await mountHarness(null);

      merged.setFilter("etoro");
      await tick();

      expect(merged.portfolio).toBeNull();
    });
  });

  describe("hasData", () => {
    it("true when filtered positions exist", async () => {
      const { merged } = await mountHarness(ETORO_PORTFOLIO);
      expect(merged.hasData).toBe(true);
    });

    it("false when filter excludes all positions", async () => {
      const { merged } = await mountHarness(ETORO_PORTFOLIO);
      merged.setFilter("manual");
      await tick();
      expect(merged.hasData).toBe(false);
    });
  });
});
