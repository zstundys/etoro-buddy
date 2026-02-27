<script lang="ts">
	import PortfolioSummary from '$lib/components/PortfolioSummary.svelte';
	import PositionsTable from '$lib/components/PositionsTable.svelte';
	import RecentTrades from '$lib/components/RecentTrades.svelte';
	import ChartsDashboard from '$lib/components/charts/ChartsDashboard.svelte';

	let { data } = $props();
</script>

{#if data.error}
	<div class="rounded-xl border border-loss/30 bg-loss/10 px-5 py-4 text-sm text-loss">
		{data.error}
	</div>
{:else}
	<PortfolioSummary portfolio={data.portfolio} />
	<PositionsTable positions={data.portfolio.positions} />
	<ChartsDashboard
		positions={data.portfolio.positions}
		trades={data.recentTrades}
	/>
	<RecentTrades trades={data.recentTrades} positions={data.portfolio.positions} />
{/if}
