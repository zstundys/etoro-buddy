import * as z from "zod";

const BASE_URL = "https://public-api.etoro.com/api/v1";

export type ApiKeys = { apiKey: string; userKey: string };

function buildHeaders(keys: ApiKeys): Record<string, string> {
  return {
    "x-api-key": keys.apiKey,
    "x-user-key": keys.userKey,
    "x-request-id": crypto.randomUUID(),
    "Content-Type": "application/json",
  };
}

// --- Schemas ---

function pick<T>(obj: Record<string, unknown>, keys: string[], fallback: T): T {
  for (const k of keys)
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  return fallback;
}

const PositionSchema = z.record(z.string(), z.unknown()).transform((raw) => ({
  positionId: pick<number>(
    raw,
    ["positionID", "positionId", "PositionID", "PositionId"],
    0,
  ),
  instrumentId: pick<number>(
    raw,
    ["instrumentID", "instrumentId", "InstrumentID", "InstrumentId"],
    0,
  ),
  openRate: pick<number>(raw, ["openRate", "OpenRate"], 0),
  units: pick<number>(raw, ["units", "Units"], 0),
  amount: pick<number>(raw, ["amount", "Amount"], 0),
  isBuy: pick<boolean>(raw, ["isBuy", "IsBuy"], true),
  openDateTime: pick<string>(raw, ["openDateTime", "OpenDateTime"], ""),
  leverage: pick<number>(raw, ["leverage", "Leverage"], 1),
  totalFees: pick<number>(raw, ["totalFees", "TotalFees"], 0),
  initialAmountInDollars: pick<number>(
    raw,
    ["initialAmountInDollars", "InitialAmountInDollars"],
    0,
  ),
}));

const PortfolioResponseSchema = z
  .object({
    clientPortfolio: z
      .object({
        positions: z.array(PositionSchema).default([]),
        credit: z.number().default(0),
      })
      .default({ positions: [], credit: 0 }),
  })
  .default({ clientPortfolio: { positions: [], credit: 0 } });

const InstrumentSchema = z.record(z.string(), z.unknown()).transform((raw) => {
  const images = (raw.images ?? raw.Images ?? []) as Array<
    Record<string, unknown>
  >;
  const logo =
    (images.find((img) => img.width === 50)?.uri as string | undefined) ??
    (images.find((img) => img.width === 35)?.uri as string | undefined) ??
    (images[0]?.uri as string | undefined);
  return {
    instrumentId: pick<number>(
      raw,
      ["instrumentID", "instrumentId", "InstrumentID"],
      0,
    ),
    displayName: pick<string | undefined>(
      raw,
      ["instrumentDisplayName", "InstrumentDisplayName"],
      undefined,
    ),
    symbol: pick<string | undefined>(
      raw,
      ["symbolFull", "SymbolFull", "internalSymbolFull", "InternalSymbolFull"],
      undefined,
    ),
    logoUrl: logo,
    stocksIndustryId: pick<number | undefined>(
      raw,
      ["stocksIndustryID", "stocksIndustryId", "StocksIndustryID"],
      undefined,
    ),
  };
});

const RateSchema = z.record(z.string(), z.unknown()).transform((raw) => ({
  instrumentId: pick<number>(
    raw,
    ["instrumentID", "instrumentId", "InstrumentID"],
    0,
  ),
  ask: pick<number>(raw, ["ask", "Ask"], 0),
  bid: pick<number>(raw, ["bid", "Bid"], 0),
}));

const TradeSchema = z.record(z.string(), z.unknown()).transform((raw) => ({
  positionId: pick<number>(raw, ["positionId", "positionID", "PositionID"], 0),
  instrumentId: pick<number>(
    raw,
    ["instrumentId", "instrumentID", "InstrumentID"],
    0,
  ),
  isBuy: pick<boolean>(raw, ["isBuy", "IsBuy"], true),
  openRate: pick<number>(raw, ["openRate", "OpenRate"], 0),
  closeRate: pick<number>(raw, ["closeRate", "CloseRate"], 0),
  openTimestamp: pick<string>(raw, ["openTimestamp", "OpenTimestamp"], ""),
  closeTimestamp: pick<string>(raw, ["closeTimestamp", "CloseTimestamp"], ""),
  investment: pick<number>(raw, ["investment", "Investment"], 0),
  netProfit: pick<number>(raw, ["netProfit", "NetProfit"], 0),
  units: pick<number>(raw, ["units", "Units"], 0),
  leverage: pick<number>(raw, ["leverage", "Leverage"], 1),
  fees: pick<number>(raw, ["fees", "Fees"], 0),
}));

const CandleSchema = z.record(z.string(), z.unknown()).transform((raw) => ({
  instrumentId: pick<number>(
    raw,
    ["instrumentID", "instrumentId", "InstrumentID"],
    0,
  ),
  date: pick<string>(raw, ["fromDate", "FromDate"], ""),
  open: pick<number>(raw, ["open", "Open"], 0),
  high: pick<number>(raw, ["high", "High"], 0),
  low: pick<number>(raw, ["low", "Low"], 0),
  close: pick<number>(raw, ["close", "Close"], 0),
  volume: pick<number>(raw, ["volume", "Volume"], 0),
}));

// --- Types ---

export type Position = z.output<typeof PositionSchema>;
export type Instrument = z.output<typeof InstrumentSchema>;
export type Rate = z.output<typeof RateSchema>;
export type Trade = z.output<typeof TradeSchema>;
export type Candle = z.output<typeof CandleSchema>;

export type EnrichedPosition = Position & {
  symbol?: string;
  displayName?: string;
  logoUrl?: string;
  stocksIndustryId?: number;
  currentRate?: number;
  pnl?: number;
  pnlPercent?: number;
};

export type Watchlist = { id: string; name: string; instrumentIds: number[] };

export type InstrumentSnapshot = {
  instrumentId: number;
  symbol?: string;
  displayName?: string;
  logoUrl?: string;
  currentRate?: number;
};

export type EnrichedTrade = Trade & {
  symbol?: string;
  displayName?: string;
  logoUrl?: string;
};

export type PortfolioData = {
  positions: EnrichedPosition[];
  credit: number;
  totalInvested: number;
  totalPnl: number;
};

// --- Helpers ---

function safeParseArray<T>(
  schema: {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
  },
  data: unknown,
): T[] {
  const items = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (Object.values(data).find(Array.isArray) ?? [])
      : [];
  return (items as unknown[]).flatMap((item) => {
    const result = schema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

export async function fetchInstruments(
  keys: ApiKeys,
  ids: number[],
): Promise<Instrument[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/market-data/instruments?instrumentIds=${ids.join(",")}`,
      { headers: buildHeaders(keys) },
    );
    if (!res.ok) return [];
    return safeParseArray(InstrumentSchema, await res.json());
  } catch {
    return [];
  }
}

export async function fetchRates(
  keys: ApiKeys,
  ids: number[],
): Promise<Rate[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/market-data/instruments/rates?instrumentIds=${ids.join(",")}`,
      { headers: buildHeaders(keys) },
    );
    if (!res.ok) return [];
    return safeParseArray(RateSchema, await res.json());
  } catch {
    return [];
  }
}

function enrichPositions(
  rawPositions: Position[],
  instruments: Instrument[],
  rates: Rate[],
): { positions: EnrichedPosition[]; totalInvested: number; totalPnl: number } {
  const instrumentMap = new Map(instruments.map((i) => [i.instrumentId, i]));
  const rateMap = new Map(rates.map((r) => [r.instrumentId, r]));

  let totalInvested = 0;
  let totalPnl = 0;

  const positions: EnrichedPosition[] = rawPositions.map((pos) => {
    const info = instrumentMap.get(pos.instrumentId);
    const rate = rateMap.get(pos.instrumentId);
    const currentRate = rate ? (pos.isBuy ? rate.bid : rate.ask) : undefined;
    let pnl: number | undefined;
    let pnlPercent: number | undefined;

    if (currentRate !== undefined) {
      const direction = pos.isBuy ? 1 : -1;
      pnl = (currentRate - pos.openRate) * pos.units * direction * pos.leverage;
      pnlPercent = pos.amount > 0 ? (pnl / pos.amount) * 100 : 0;
    }

    totalInvested += pos.amount;
    if (pnl !== undefined) totalPnl += pnl;

    return {
      ...pos,
      symbol: info?.symbol,
      displayName: info?.displayName,
      logoUrl: info?.logoUrl,
      stocksIndustryId: info?.stocksIndustryId,
      currentRate,
      pnl,
      pnlPercent,
    };
  });

  return { positions, totalInvested, totalPnl };
}

export async function fetchStocksIndustries(
  keys: ApiKeys,
): Promise<Map<number, string>> {
  try {
    const res = await fetch(`${BASE_URL}/market-data/stocks-industries`, {
      headers: buildHeaders(keys),
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const items = json?.stocksIndustries ?? [];
    const map = new Map<number, string>();
    for (const item of items) {
      const id = item.industryID ?? item.industryId;
      const name = item.industryName ?? item.IndustryName;
      if (id != null && name) map.set(id, name);
    }
    return map;
  } catch {
    return new Map();
  }
}

// --- Public API ---

export async function fetchPortfolio(keys: ApiKeys): Promise<PortfolioData> {
  const portfolioRes = await fetch(`${BASE_URL}/trading/info/portfolio`, {
    headers: buildHeaders(keys),
  });

  if (!portfolioRes.ok) {
    const text = await portfolioRes.text();
    throw new Error(`eToro portfolio error ${portfolioRes.status}: ${text}`);
  }

  const parsed = PortfolioResponseSchema.parse(await portfolioRes.json());
  const rawPositions = parsed.clientPortfolio.positions;
  const credit = parsed.clientPortfolio.credit;

  if (rawPositions.length === 0) {
    return { positions: [], credit, totalInvested: 0, totalPnl: 0 };
  }

  const instrumentIds = [...new Set(rawPositions.map((p) => p.instrumentId))];

  const [instruments, rates] = await Promise.all([
    fetchInstruments(keys, instrumentIds),
    fetchRates(keys, instrumentIds),
  ]);

  const { positions, totalInvested, totalPnl } = enrichPositions(
    rawPositions,
    instruments,
    rates,
  );
  return { positions, credit, totalInvested, totalPnl };
}

export async function fetchTradeHistory(
  keys: ApiKeys,
  days: number = 90,
): Promise<EnrichedTrade[]> {
  const minDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const res = await fetch(
    `${BASE_URL}/trading/info/trade/history?minDate=${minDate}&pageSize=500`,
    { headers: buildHeaders(keys) },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eToro trade history error ${res.status}: ${text}`);
  }

  const raw = await res.json();
  const trades = safeParseArray(TradeSchema, raw);

  if (trades.length === 0) return [];

  const instrumentIds = [...new Set(trades.map((t) => t.instrumentId))];
  const instruments = await fetchInstruments(keys, instrumentIds);
  const instrumentMap = new Map(instruments.map((i) => [i.instrumentId, i]));

  return trades.map((trade) => {
    const info = instrumentMap.get(trade.instrumentId);
    return {
      ...trade,
      symbol: info?.symbol,
      displayName: info?.displayName,
      logoUrl: info?.logoUrl,
    };
  });
}

export async function fetchCandles(
  keys: ApiKeys,
  instrumentId: number,
  count: number = 90,
  direction: "asc" | "desc" = "asc",
  interval: string = "OneDay",
): Promise<Candle[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/market-data/instruments/${instrumentId}/history/candles/${direction}/${interval}/${count}`,
      { headers: buildHeaders(keys) },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const nested = json?.candles?.[0]?.candles ?? json?.candles ?? [];
    return safeParseArray(CandleSchema, nested);
  } catch {
    return [];
  }
}

export async function fetchAllCandles(
  keys: ApiKeys,
  instrumentIds: number[],
  count: number = 90,
): Promise<Map<number, Candle[]>> {
  const result = new Map<number, Candle[]>();
  const CONCURRENCY = 5;
  const queue = [...instrumentIds];

  async function worker() {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const candles = await fetchCandles(keys, id, count);
      if (candles.length > 0) result.set(id, candles);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
  );
  return result;
}

export async function fetchWatchlists(keys: ApiKeys): Promise<Watchlist[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/watchlists?itemsPerPageForSingle=200`,
      { headers: buildHeaders(keys) },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const lists = json?.watchlists ?? json ?? [];
    if (!Array.isArray(lists)) return [];
    return lists.flatMap((w: Record<string, unknown>) => {
      const raw = w.WatchlistId ?? w.watchlistId ?? w.id;
      const id = raw != null ? String(raw) : undefined;
      const name = (w.Name ?? w.name ?? w.displayName) as string | undefined;
      if (!id || !name) return [];

      const items = (w.Items ?? w.items ?? []) as Array<
        Record<string, unknown>
      >;
      const instrumentIds = items
        .filter((it) => (it.ItemType ?? it.itemType) === "Instrument")
        .map((it) => Number(it.ItemId ?? it.itemId ?? 0))
        .filter((n) => n > 0);

      if (instrumentIds.length === 0) return [];
      return [{ id, name, instrumentIds }];
    });
  } catch {
    return [];
  }
}

export async function fetchWatchlistInstruments(
  keys: ApiKeys,
  instrumentIds: number[],
): Promise<InstrumentSnapshot[]> {
  if (instrumentIds.length === 0) return [];
  try {
    const [instruments, rates] = await Promise.all([
      fetchInstruments(keys, instrumentIds),
      fetchRates(keys, instrumentIds),
    ]);

    const instrumentMap = new Map(instruments.map((i) => [i.instrumentId, i]));
    const rateMap = new Map(rates.map((r) => [r.instrumentId, r]));

    return instrumentIds.map((id) => {
      const info = instrumentMap.get(id);
      const rate = rateMap.get(id);
      return {
        instrumentId: id,
        symbol: info?.symbol,
        displayName: info?.displayName,
        logoUrl: info?.logoUrl,
        currentRate: rate ? rate.bid : undefined,
      };
    });
  } catch {
    return [];
  }
}
