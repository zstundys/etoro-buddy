import {
	fetchPortfolio,
	fetchTradeHistory,
	type PortfolioData,
	type EnrichedTrade,
	type ApiKeys
} from './etoro-api';

const STORAGE_KEY = 'etoro-api-keys';

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

export function createClientApi() {
	let keys = $state<ApiKeys | null>(readKeys());
	let portfolio = $state<PortfolioData | null>(null);
	let trades = $state<EnrichedTrade[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

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
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
			portfolio = null;
			trades = [];
		} finally {
			loading = false;
		}
	}

	return {
		get keys() { return keys; },
		get hasKeys() { return hasKeys; },
		get portfolio() { return portfolio; },
		get trades() { return trades; },
		get loading() { return loading; },
		get error() { return error; },
		saveKeys,
		clearKeys,
		load
	};
}
