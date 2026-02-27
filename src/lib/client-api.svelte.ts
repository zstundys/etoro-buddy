import {
	fetchPortfolio,
	fetchTradeHistory,
	type PortfolioData,
	type EnrichedTrade,
	type ApiKeys
} from './etoro-api';

const STORAGE_KEY = 'etoro-api-keys';
const LAST_LOADED_KEY = 'etoro-last-loaded';

function readKeys(): ApiKeys | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (parsed?.apiKey && parsed?.userKey) return parsed;
		return null;
	} catch {
		return null;
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

export function createClientApi() {
	let keys = $state<ApiKeys | null>(readKeys());
	let portfolio = $state<PortfolioData | null>(null);
	let trades = $state<EnrichedTrade[]>([]);
	let loading = $state(false);
	let refreshing = $state(false);
	let error = $state<string | null>(null);
	let lastLoaded = $state<Date | null>(readLastLoaded());

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
	}

	async function load() {
		if (!keys) return;
		loading = true;
		error = null;
		try {
			const [p, t] = await Promise.all([
				fetchPortfolio(keys),
				fetchTradeHistory(keys, 90).catch(() => [] as EnrichedTrade[])
			]);
			portfolio = p;
			trades = t;
			const now = new Date();
			lastLoaded = now;
			writeLastLoaded(now);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
			portfolio = null;
			trades = [];
		} finally {
			loading = false;
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
			error = null;
			const now = new Date();
			lastLoaded = now;
			writeLastLoaded(now);
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
		saveKeys,
		clearKeys,
		load,
		refresh
	};
}
