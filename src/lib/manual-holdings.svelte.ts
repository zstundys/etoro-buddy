import type { EnrichedPosition } from "./etoro-api";

export type ManualHolding = {
  id: string;
  symbol: string;
  buyDate: string;
  buyPrice: number;
  units: number;
  source?: string;
  notes?: string;
  instrumentId?: number;
};

const STORAGE_KEY = "manual-holdings";

function readHoldings(): ManualHolding[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ManualHolding[]) : [];
  } catch {
    return [];
  }
}

function writeHoldings(data: ManualHolding[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash < 0 ? hash : -hash - 1;
}

export function toEnrichedPosition(
  h: ManualHolding,
  rate?: number,
  logoUrl?: string,
): EnrichedPosition {
  const amount = h.buyPrice * h.units;
  const pnl = rate !== undefined ? (rate - h.buyPrice) * h.units : undefined;
  return {
    positionId: hashCode(h.id),
    instrumentId: h.instrumentId ?? 0,
    openRate: h.buyPrice,
    units: h.units,
    amount,
    isBuy: true,
    openDateTime: h.buyDate,
    leverage: 1,
    totalFees: 0,
    initialAmountInDollars: amount,
    mirrorId: 0,
    symbol: h.symbol,
    displayName: h.symbol,
    logoUrl,
    currentRate: rate,
    pnl,
    pnlPercent:
      pnl !== undefined && amount > 0 ? (pnl / amount) * 100 : undefined,
  };
}

export function createManualHoldingsStore() {
  let holdings = $state<ManualHolding[]>(readHoldings());

  function persist() {
    writeHoldings(holdings);
  }

  function add(
    entry: Omit<ManualHolding, "id">,
  ) {
    const holding: ManualHolding = { ...entry, id: crypto.randomUUID() };
    holdings = [...holdings, holding];
    persist();
    return holding;
  }

  function update(id: string, partial: Partial<Omit<ManualHolding, "id">>) {
    holdings = holdings.map((h) =>
      h.id === id ? { ...h, ...partial } : h,
    );
    persist();
  }

  function remove(id: string) {
    holdings = holdings.filter((h) => h.id !== id);
    persist();
  }

  return {
    get holdings() {
      return holdings;
    },
    add,
    update,
    remove,
  };
}

export type ManualHoldingsStore = ReturnType<typeof createManualHoldingsStore>;
