import { fetchPortfolio, fetchTradeHistory } from '$lib/etoro';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [portfolio, recentTrades] = await Promise.all([
			fetchPortfolio(),
			fetchTradeHistory(90).catch(() => [])
		]);
		return { portfolio, recentTrades, error: null };
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Failed to load portfolio';
		return {
			portfolio: { positions: [], credit: 0, totalInvested: 0, totalPnl: 0 },
			recentTrades: [],
			error: message
		};
	}
};
