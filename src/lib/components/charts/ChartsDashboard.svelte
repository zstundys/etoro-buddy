<script lang="ts">
	import type { EnrichedPosition, EnrichedTrade } from '$lib/etoro-api';
	import DateRangeFilter from '../DateRangeFilter.svelte';
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

	const dateRange = $derived.by(() => {
		let min = Infinity, max = -Infinity;
		for (const p of positions) {
			if (!p.openDateTime) continue;
			const t = new Date(p.openDateTime).getTime();
			if (isNaN(t)) continue;
			if (t < min) min = t;
			if (t > max) max = t;
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (min > max) return { min: today, max: today };
		return { min: new Date(min), max: new Date(Math.max(max, today.getTime())) };
	});

	let filterStart = $state<Date | null>(null);
	let filterEnd = $state<Date | null>(null);

	const activeStart = $derived(filterStart ?? dateRange.min);
	const activeEnd = $derived(filterEnd ?? dateRange.max);

	function onFilterChange(start: Date, end: Date) {
		const sameAsMin = start.getTime() <= dateRange.min.getTime();
		const sameAsMax = end.getTime() >= dateRange.max.getTime();
		filterStart = sameAsMin ? null : start;
		filterEnd = sameAsMax ? null : end;
	}

	const filtered = $derived.by(() => {
		if (filterStart === null && filterEnd === null) return { positions, trades };
		const fp = positions.filter((p) => {
			if (!p.openDateTime) return true;
			const t = new Date(p.openDateTime).getTime();
			return t >= activeStart.getTime() && t <= activeEnd.getTime();
		});
		const ft = trades.filter((t) => {
			if (!t.closeTimestamp) return true;
			const d = new Date(t.closeTimestamp).getTime();
			return d >= activeStart.getTime() && d <= activeEnd.getTime();
		});
		return { positions: fp, trades: ft };
	});
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
			<div class="ml-auto">
				<DateRangeFilter
					minDate={dateRange.min}
					maxDate={dateRange.max}
					startDate={activeStart}
					endDate={activeEnd}
					onchange={onFilterChange}
					minimal
				/>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Portfolio Allocation</h3>
				<Treemap positions={filtered.positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Timing vs Performance</h3>
				<BubbleScatter positions={filtered.positions} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Capital Over Time</h3>
				<Streamgraph positions={filtered.positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Sunburst</h3>
				<Sunburst positions={filtered.positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">P&L Distribution</h3>
				<Beeswarm positions={filtered.positions} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Trade Activity</h3>
				<CalendarHeatmap positions={filtered.positions} trades={filtered.trades} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Position Lifespans</h3>
				<Timeline positions={filtered.positions} />
			</div>

			<div class="rounded-xl border border-border bg-surface-raised p-5">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Fees &amp; Dividends</h3>
				<FeesWaterfall positions={filtered.positions} />
			</div>

			<div class="col-span-1 rounded-xl border border-border bg-surface-raised p-5 lg:col-span-2">
				<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Monthly Capital Flow</h3>
				<ChordDiagram positions={filtered.positions} />
			</div>
		</div>
	</section>
{/if}
