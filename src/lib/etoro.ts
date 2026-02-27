import * as z from 'zod';
import { ETORO_API_KEY, ETORO_USER_KEY } from '$env/static/private';

const BASE_URL = 'https://public-api.etoro.com/api/v1';

function headers(): Record<string, string> {
	if (!ETORO_API_KEY || !ETORO_USER_KEY) {
		throw new Error('Missing ETORO_API_KEY or ETORO_USER_KEY in .env');
	}
	return {
		'x-api-key': ETORO_API_KEY,
		'x-user-key': ETORO_USER_KEY,
		'x-request-id': crypto.randomUUID(),
		'Content-Type': 'application/json'
	};
}

// --- Schemas ---

/** Pick first defined value from an object for any of the given keys */
function pick<T>(obj: Record<string, unknown>, keys: string[], fallback: T): T {
	for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
	return fallback;
}

/**
 * The eToro API uses mixed casing: positionID, instrumentID, openRate, isBuy, etc.
 * We accept any shape and normalize with pick().
 */
const PositionSchema = z
	.record(z.string(), z.unknown())
	.transform((raw) => ({
		positionId: pick<number>(raw, ['positionID', 'positionId', 'PositionID', 'PositionId'], 0),
		instrumentId: pick<number>(raw, ['instrumentID', 'instrumentId', 'InstrumentID', 'InstrumentId'], 0),
		openRate: pick<number>(raw, ['openRate', 'OpenRate'], 0),
		units: pick<number>(raw, ['units', 'Units'], 0),
		amount: pick<number>(raw, ['amount', 'Amount'], 0),
		isBuy: pick<boolean>(raw, ['isBuy', 'IsBuy'], true),
		openDateTime: pick<string>(raw, ['openDateTime', 'OpenDateTime'], ''),
		leverage: pick<number>(raw, ['leverage', 'Leverage'], 1),
		totalFees: pick<number>(raw, ['totalFees', 'TotalFees'], 0),
		initialAmountInDollars: pick<number>(raw, ['initialAmountInDollars', 'InitialAmountInDollars'], 0)
	}));

const PortfolioResponseSchema = z
	.object({
		clientPortfolio: z
			.object({
				positions: z.array(PositionSchema).default([]),
				credit: z.number().default(0)
			})
			.default({ positions: [], credit: 0 })
	})
	.default({ clientPortfolio: { positions: [], credit: 0 } });

const InstrumentSchema = z
	.record(z.string(), z.unknown())
	.transform((raw) => {
		const images = (raw.images ?? raw.Images ?? []) as Array<Record<string, unknown>>;
		const logo = images.find((img) => img.width === 50)?.uri as string | undefined
			?? images.find((img) => img.width === 35)?.uri as string | undefined
			?? images[0]?.uri as string | undefined;
		return {
			instrumentId: pick<number>(raw, ['instrumentID', 'instrumentId', 'InstrumentID'], 0),
			displayName: pick<string | undefined>(raw, ['instrumentDisplayName', 'InstrumentDisplayName'], undefined),
			symbol: pick<string | undefined>(raw, ['symbolFull', 'SymbolFull', 'internalSymbolFull', 'InternalSymbolFull'], undefined),
			logoUrl: logo
		};
	});

const RateSchema = z
	.record(z.string(), z.unknown())
	.transform((raw) => ({
		instrumentId: pick<number>(raw, ['instrumentID', 'instrumentId', 'InstrumentID'], 0),
		ask: pick<number>(raw, ['ask', 'Ask'], 0),
		bid: pick<number>(raw, ['bid', 'Bid'], 0)
	}));

const TradeSchema = z
	.record(z.string(), z.unknown())
	.transform((raw) => ({
		positionId: pick<number>(raw, ['positionId', 'positionID', 'PositionID'], 0),
		instrumentId: pick<number>(raw, ['instrumentId', 'instrumentID', 'InstrumentID'], 0),
		isBuy: pick<boolean>(raw, ['isBuy', 'IsBuy'], true),
		openRate: pick<number>(raw, ['openRate', 'OpenRate'], 0),
		closeRate: pick<number>(raw, ['closeRate', 'CloseRate'], 0),
		openTimestamp: pick<string>(raw, ['openTimestamp', 'OpenTimestamp'], ''),
		closeTimestamp: pick<string>(raw, ['closeTimestamp', 'CloseTimestamp'], ''),
		investment: pick<number>(raw, ['investment', 'Investment'], 0),
		netProfit: pick<number>(raw, ['netProfit', 'NetProfit'], 0),
		units: pick<number>(raw, ['units', 'Units'], 0),
		leverage: pick<number>(raw, ['leverage', 'Leverage'], 1),
		fees: pick<number>(raw, ['fees', 'Fees'], 0)
	}));

// --- Types (inferred from schemas) ---

export type Position = z.output<typeof PositionSchema>;
export type Instrument = z.output<typeof InstrumentSchema>;
export type Rate = z.output<typeof RateSchema>;
export type Trade = z.output<typeof TradeSchema>;

export type EnrichedPosition = Position & {
	symbol?: string;
	displayName?: string;
	logoUrl?: string;
	currentRate?: number;
	pnl?: number;
	pnlPercent?: number;
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

// --- API ---

export async function fetchPortfolio(): Promise<PortfolioData> {
	const portfolioRes = await fetch(`${BASE_URL}/trading/info/portfolio`, {
		headers: headers()
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
		fetchInstruments(instrumentIds),
		fetchRates(instrumentIds)
	]);

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

		return { ...pos, symbol: info?.symbol, displayName: info?.displayName, logoUrl: info?.logoUrl, currentRate, pnl, pnlPercent };
	});

	return { positions, credit, totalInvested, totalPnl };
}

function safeParseArray<T>(schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } }, data: unknown): T[] {
	const items = Array.isArray(data)
		? data
		: data && typeof data === 'object'
			? Object.values(data).find(Array.isArray) ?? []
			: [];
	return (items as unknown[]).flatMap((item) => {
		const result = schema.safeParse(item);
		return result.success ? [result.data] : [];
	});
}

async function fetchInstruments(ids: number[]): Promise<Instrument[]> {
	try {
		const res = await fetch(
			`${BASE_URL}/market-data/instruments?instrumentIds=${ids.join(',')}`,
			{ headers: headers() }
		);
		if (!res.ok) return [];
		return safeParseArray(InstrumentSchema, await res.json());
	} catch {
		return [];
	}
}

async function fetchRates(ids: number[]): Promise<Rate[]> {
	try {
		const res = await fetch(
			`${BASE_URL}/market-data/instruments/rates?instrumentIds=${ids.join(',')}`,
			{ headers: headers() }
		);
		if (!res.ok) return [];
		return safeParseArray(RateSchema, await res.json());
	} catch {
		return [];
	}
}

export async function fetchTradeHistory(days: number = 90): Promise<EnrichedTrade[]> {
	const minDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10);

	const res = await fetch(
		`${BASE_URL}/trading/info/trade/history?minDate=${minDate}&pageSize=500`,
		{ headers: headers() }
	);

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`eToro trade history error ${res.status}: ${text}`);
	}

	const raw = await res.json();
	const trades = safeParseArray(TradeSchema, raw);

	if (trades.length === 0) return [];

	const instrumentIds = [...new Set(trades.map((t) => t.instrumentId))];
	const instruments = await fetchInstruments(instrumentIds);
	const instrumentMap = new Map(instruments.map((i) => [i.instrumentId, i]));

	return trades.map((trade) => {
		const info = instrumentMap.get(trade.instrumentId);
		return {
			...trade,
			symbol: info?.symbol,
			displayName: info?.displayName,
			logoUrl: info?.logoUrl
		};
	});
}
