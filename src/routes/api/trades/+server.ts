import { json } from '@sveltejs/kit';
import { fetchTradeHistory } from '$lib/etoro-api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	const apiKey = request.headers.get('x-etoro-api-key');
	const userKey = request.headers.get('x-etoro-user-key');

	if (!apiKey || !userKey) {
		return json({ error: 'Missing API keys' }, { status: 400 });
	}

	const days = Number(url.searchParams.get('days') ?? 90);

	try {
		const trades = await fetchTradeHistory({ apiKey, userKey }, days);
		return json(trades);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Failed to load trade history';
		return json({ error: message }, { status: 502 });
	}
};
