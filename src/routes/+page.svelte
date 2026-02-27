<script lang="ts">
	import { onMount } from 'svelte';
	import PortfolioSummary from '$lib/components/PortfolioSummary.svelte';
	import PositionsTable from '$lib/components/PositionsTable.svelte';
	import RecentTrades from '$lib/components/RecentTrades.svelte';
	import ChartsDashboard from '$lib/components/charts/ChartsDashboard.svelte';
	import ApiKeySetup from '$lib/components/ApiKeySetup.svelte';
	import { createClientApi } from '$lib/client-api.svelte';
	import type { PortfolioData, EnrichedTrade } from '$lib/etoro-api';

	let { data } = $props();

	const client = createClientApi();

	const useClientData = $derived(client.hasKeys && client.portfolio !== null);

	const portfolio = $derived<PortfolioData | null>(
		useClientData
			? client.portfolio
			: data.portfolio
	);

	const trades = $derived<EnrichedTrade[]>(
		useClientData
			? client.trades
			: data.recentTrades
	);

	const activeError = $derived(
		client.hasKeys ? client.error : data.error
	);

	const hasData = $derived(portfolio !== null && portfolio.positions.length > 0);

	onMount(() => {
		if (client.hasKeys) {
			client.load();
		}
	});

	function handleKeysSubmit(apiKey: string, userKey: string) {
		client.saveKeys(apiKey, userKey);
		client.load();
	}

	function handleKeysClear() {
		client.clearKeys();
	}
</script>

<div class="mb-6">
	<ApiKeySetup
		onsubmit={handleKeysSubmit}
		onclear={handleKeysClear}
		hasKeys={client.hasKeys}
		error={client.error}
		loading={client.loading}
		compact={hasData && !client.hasKeys}
	/>
</div>

{#if activeError}
	<div class="rounded-xl border border-loss/30 bg-loss/10 px-5 py-4 text-sm text-loss">
		{activeError}
	</div>
{/if}

{#if client.loading}
	<div class="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface-raised px-8 py-16">
		<div class="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand"></div>
		<p class="text-sm text-text-secondary">Loading portfolio...</p>
	</div>
{:else if hasData && portfolio}
	<PortfolioSummary {portfolio} />
	<PositionsTable positions={portfolio.positions} />
	<ChartsDashboard
		positions={portfolio.positions}
		{trades}
	/>
	<RecentTrades {trades} positions={portfolio.positions} />
{/if}
