import {
	fetchPortfolio,
	fetchTradeHistory,
	fetchAllCandles,
	fetchInstruments,
	fetchStocksIndustries,
	type PortfolioData,
	type EnrichedTrade,
	type ApiKeys,
	type Candle
} from './etoro-api';
import { env } from '$env/dynamic/public';

const STORAGE_KEY = 'etoro-api-keys';
const LAST_LOADED_KEY = 'etoro-last-loaded';
const PORTFOLIO_KEY = 'etoro-portfolio';
const TRADES_KEY = 'etoro-trades';

const ENV_FALLBACK_KEYS: ApiKeys | null =
	env.PUBLIC_ETORO_API_KEY && env.PUBLIC_ETORO_USER_KEY
		? { apiKey: env.PUBLIC_ETORO_API_KEY, userKey: env.PUBLIC_ETORO_USER_KEY }
		: null;

function readKeys(): ApiKeys | null {
	if (typeof localStorage === 'undefined') return ENV_FALLBACK_KEYS;
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
	if (typeof localStorage === 'undefined') return;
	if (keys) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
	} else {
		localStorage.removeItem(STORAGE_KEY);
	}
}

function readLastLoaded(): Date | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(LAST_LOADED_KEY);
	if (!raw) return null;
	const d = new Date(raw);
	return isNaN(d.getTime()) ? null : d;
}

function writeLastLoaded(date: Date | null) {
	if (typeof localStorage === 'undefined') return;
	if (date) {
		localStorage.setItem(LAST_LOADED_KEY, date.toISOString());
	} else {
		localStorage.removeItem(LAST_LOADED_KEY);
	}
}

function readCachedData(): { portfolio: PortfolioData; trades: EnrichedTrade[] } | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const rawPortfolio = localStorage.getItem(PORTFOLIO_KEY);
		const rawTrades = localStorage.getItem(TRADES_KEY);
		if (!rawPortfolio) return null;
		const portfolio = JSON.parse(rawPortfolio);
		const trades = rawTrades ? JSON.parse(rawTrades) : [];
		return { portfolio, trades };
	} catch {
		return null;
	}
}

function writeCachedData(portfolio: PortfolioData, trades: EnrichedTrade[]) {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
		localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
	} catch {
		// localStorage quota exceeded — silently ignore
	}
}

function clearCachedData() {
	if (typeof localStorage === 'undefined') return;
	localStorage.removeItem(PORTFOLIO_KEY);
	localStorage.removeItem(TRADES_KEY);
}

export function createClientApi() {
	const cached = readKeys() ? readCachedData() : null;

	let keys = $state<ApiKeys | null>(readKeys());
	let portfolio = $state<PortfolioData | null>(cached?.portfolio ?? null);
	let trades = $state<EnrichedTrade[]>(cached?.trades ?? []);
	let loading = $state(false);
	let refreshing = $state(false);
	let error = $state<string | null>(null);
	let lastLoaded = $state<Date | null>(readLastLoaded());
	let fromCache = $state(cached !== null);
	let candles = $state<Map<number, Candle[]>>(new Map());
	let candlesLoading = $state(false);
	let sectorMap = $state<Map<number, string>>(new Map());
	let sectorMapLoading = $state(false);
	let sectorMapLoaded = $state(false);

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
		clearCachedData();
	}

	async function load() {
		if (!keys) return;
		if (portfolio !== null) return;
		loading = true;
		error = null;
		try {
			const [p, t] = await Promise.all([
				fetchPortfolio(keys),
				fetchTradeHistory(keys, 90).catch(() => [] as EnrichedTrade[])
			]);
			portfolio = p;
			trades = t;
			fromCache = false;
			const now = new Date();
			lastLoaded = now;
			writeLastLoaded(now);
			writeCachedData(p, t);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
			portfolio = null;
			trades = [];
		} finally {
			loading = false;
		}
	}

	async function loadCandles() {
		if (!keys || !portfolio || candlesLoading) return;
		const ids = [...new Set(portfolio.positions.map((p) => p.instrumentId))];
		if (ids.length === 0) return;
		candlesLoading = true;
		try {
			candles = await fetchAllCandles(keys, ids, 90);
		} catch {
			// non-critical — charts just won't render
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
				fetchStocksIndustries(keys)
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

	async function refresh() {
		if (!keys || refreshing || loading) return;
		refreshing = true;
		try {
			const [p, t] = await Promise.all([
				fetchPortfolio(keys),
				fetchTradeHistory(keys, 90).catch(() => [] as EnrichedTrade[])
			]);
			portfolio = p;
			trades = t;
			fromCache = false;
			error = null;
			const now = new Date();
			lastLoaded = now;
			writeLastLoaded(now);
			writeCachedData(p, t);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to refresh data';
		} finally {
			refreshing = false;
		}
	}

	return {
		get keys() { return keys; },
		get hasKeys() { return hasKeys; },
		get portfolio() { return portfolio; },
		get trades() { return trades; },
		get loading() { return loading; },
		get refreshing() { return refreshing; },
		get error() { return error; },
		get lastLoaded() { return lastLoaded; },
		get fromCache() { return fromCache; },
		get candles() { return candles; },
		get candlesLoading() { return candlesLoading; },
		get sectorMap() { return sectorMap; },
		saveKeys,
		clearKeys,
		load,
		loadCandles,
		loadSectorMap,
		refresh
	};
}
