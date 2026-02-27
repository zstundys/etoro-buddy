<script lang="ts">
	import type { EnrichedPosition, EnrichedTrade } from '$lib/etoro-api';
	import Treemap from './Treemap.svelte';
	import BubbleScatter from './BubbleScatter.svelte';
	import Streamgraph from './Streamgraph.svelte';
	import Sunburst from './Sunburst.svelte';
	import CalendarHeatmap from './CalendarHeatmap.svelte';
	import Beeswarm from './Beeswarm.svelte';
	import Timeline from './Timeline.svelte';
	import FeesWaterfall from './FeesWaterfall.svelte';
	import ChordDiagram from './ChordDiagram.svelte';

	let { positions, trades }: { positions: EnrichedPosition[]; trades: EnrichedTrade[] } = $props();
</script>

{#if positions.length > 0}
	<section class="mt-10 mb-10">
		<div class="mb-6 flex items-center gap-3">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15">
				<svg class="h-4 w-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
			</div>
			<h2 class="text-lg font-semibold tracking-tight">Visualizations</h2>
		</div>

		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Portfolio Allocation</h3>
				<Treemap {positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Timing vs Performance</h3>
				<BubbleScatter {positions} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Capital Over Time</h3>
				<Streamgraph {positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Sunburst</h3>
				<Sunburst {positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">P&L Distribution</h3>
				<Beeswarm {positions} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Trade Activity</h3>
				<CalendarHeatmap {positions} {trades} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Position Lifespans</h3>
				<Timeline {positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Fees &amp; Dividends</h3>
				<FeesWaterfall {positions} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Monthly Capital Flow</h3>
				<ChordDiagram {positions} />
			</div>
		</div>
	</section>
{/if}
