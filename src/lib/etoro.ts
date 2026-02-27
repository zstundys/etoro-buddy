import { env } from '$env/dynamic/private';
import { fetchPortfolio as _fetchPortfolio, fetchTradeHistory as _fetchTradeHistory } from './etoro-api';

export type { Position, Instrument, Rate, Trade, EnrichedPosition, EnrichedTrade, PortfolioData, ApiKeys } from './etoro-api';

function envKeys() {
	if (!env.ETORO_API_KEY || !env.ETORO_USER_KEY) {
		throw new Error('Missing ETORO_API_KEY or ETORO_USER_KEY in .env');
	}
	return { apiKey: env.ETORO_API_KEY, userKey: env.ETORO_USER_KEY };
}

export function hasSystemKeys(): boolean {
	return !!(env.ETORO_API_KEY && env.ETORO_USER_KEY);
}

export function fetchPortfolio() {
	return _fetchPortfolio(envKeys());
}

export function fetchTradeHistory(days: number = 90) {
	return _fetchTradeHistory(envKeys(), days);
}
