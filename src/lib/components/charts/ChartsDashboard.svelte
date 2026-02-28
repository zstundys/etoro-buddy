<script lang="ts">
	import type { EnrichedPosition, EnrichedTrade, Candle } from '$lib/etoro-api';
	import { buildLogoColorMap } from '$lib/chart-utils';
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
	import PortfolioValueOverTime from './PortfolioValueOverTime.svelte';
	import PerformanceRace from './PerformanceRace.svelte';
	import HorizonChart from './HorizonChart.svelte';
	import VolumeRibbons from './VolumeRibbons.svelte';
	import ChartCard from './ChartCard.svelte';

	let { positions, trades, candleMap = new Map(), credit = 0, sectorMap = new Map() }: {
		positions: EnrichedPosition[];
		trades: EnrichedTrade[];
		candleMap?: Map<number, Candle[]>;
		credit?: number;
		sectorMap?: Map<number, string>;
	} = $props();

	const hasCandleData = $derived(candleMap.size > 0);

	let colorMap = $state<Map<string, string>>(new Map());

	$effect(() => {
		if (positions.length === 0) return;
		buildLogoColorMap(positions).then((m) => { colorMap = m; });
	});

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

		<div class="flex flex-col gap-4">
			{#if hasCandleData}
				<ChartCard
					storageKey="chart-portfolio-value"
					title="Portfolio Value Over Time"
					description="Stacked area chart showing total portfolio value each day. Each colored layer is one instrument, sized by its market value (units × closing price). Click legend items to isolate specific instruments — the Y-axis recalibrates to the selected subset."
				>
					<PortfolioValueOverTime positions={filtered.positions} {candleMap} {credit} {colorMap} />
				</ChartCard>
			{:else}
				<div class="rounded-xl border border-border bg-surface-raised p-5">
					<h3 class="mb-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Portfolio Value Over Time</h3>
					<div class="flex items-center justify-center gap-3 py-12 text-sm text-text-secondary">
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"></div>
						Loading price history...
					</div>
				</div>
			{/if}

			<ChartCard
				storageKey="chart-allocation"
				title="Portfolio Allocation"
				description="Treemap showing how your capital is distributed across instruments. Each rectangle is proportional to the amount invested. Color encodes P&L performance — green for gains, red for losses."
			>
				<Treemap positions={filtered.positions} {sectorMap} />
			</ChartCard>

			<ChartCard
				storageKey="chart-bubble-scatter"
				title="Timing vs Performance"
				description="Scatter plot where each bubble is a position. X-axis is when you opened the position, Y-axis is the P&L percentage. Bubble size reflects the amount invested. Helps spot whether earlier or later entries performed better."
			>
				<BubbleScatter positions={filtered.positions} />
			</ChartCard>

			<ChartCard
				storageKey="chart-streamgraph"
				title="Capital Over Time"
				description="Streamgraph showing cumulative invested capital per instrument over time. The flowing shape uses a wiggle offset to minimize slope, making it easy to see how your capital allocation evolved. Click legend items to focus on specific instruments."
			>
				<Streamgraph positions={filtered.positions} {colorMap} />
			</ChartCard>

			<ChartCard
				storageKey="chart-sunburst"
				title="Sunburst"
				description="Hierarchical ring chart of your portfolio. Inner ring shows instruments (or sectors when toggled), outer ring shows individual positions. Size encodes invested amount, outer positions are colored by P&L. Click any segment to zoom in, click the center to zoom back out."
			>
				<Sunburst positions={filtered.positions} {colorMap} {sectorMap} />
			</ChartCard>

			<ChartCard
				storageKey="chart-beeswarm"
				title="P&L Distribution"
				description="Each dot is a position, placed along a horizontal P&L axis. Dots cluster where many positions share similar returns. Quickly see the spread of your winners and losers and how they concentrate around certain P&L ranges."
			>
				<Beeswarm positions={filtered.positions} />
			</ChartCard>

			{#if hasCandleData}
				<ChartCard
					storageKey="chart-performance-race"
					title="Performance Race"
					description="Normalized line chart comparing every instrument's % change from your entry price. The dashed zero line is your break-even. Lines above are in profit, below are at a loss. Click legend items to filter — the Y-axis recalibrates to the selected instruments."
				>
					<PerformanceRace positions={filtered.positions} {candleMap} {colorMap} />
				</ChartCard>
			{/if}

			<ChartCard
				storageKey="chart-calendar"
				title="Trade Activity"
				description="Calendar heatmap showing your trading activity over time. Each cell is a day — darker cells mean more trades or larger position openings on that day. Helps identify patterns in your trading behavior."
			>
				<CalendarHeatmap positions={filtered.positions} trades={filtered.trades} />
			</ChartCard>

			{#if hasCandleData}
				<ChartCard
					storageKey="chart-horizon"
					title="Price Horizon"
					description="Compact chart with one thin row per instrument. Color intensity encodes the size of the price move from your entry: light means small change, dark means large. Teal/green = gain, red = loss. Lets you compare many instruments at a glance in minimal space. Hover for exact values."
				>
					<HorizonChart positions={filtered.positions} {candleMap} {colorMap} />
				</ChartCard>

				<ChartCard
					storageKey="chart-volume-ribbons"
					title="Volume Ribbons"
					description="Price lines where the ribbon thickness encodes trading volume — thicker means higher volume that day. When multiple instruments are shown, prices are normalized to % change from entry. Click legend items to filter and recalibrate the Y-axis."
				>
					<VolumeRibbons positions={filtered.positions} {candleMap} {colorMap} />
				</ChartCard>
			{/if}

			<ChartCard
				storageKey="chart-timeline"
				title="Position Lifespans"
				description="Gantt chart with one row per position, grouped by instrument. Each bar runs from its open date to today — longer bars are older positions. Color encodes P&L: green for profitable, red for losing. Useful for seeing position age, stacking within instruments, and timing overlaps."
			>
				<Timeline positions={filtered.positions} />
			</ChartCard>

			<ChartCard
				storageKey="chart-fees"
				title="Fees & Dividends"
				description="Waterfall chart breaking down the total fees paid across your positions. Each bar is one position's fees, stacked to show the cumulative total. Helps identify which positions have the highest cost drag on your portfolio."
			>
				<FeesWaterfall positions={filtered.positions} />
			</ChartCard>

			<ChartCard
				storageKey="chart-chord"
				title="Monthly Capital Flow"
				description="Chord diagram showing how capital moves between instruments across months. Thicker chords indicate larger amounts allocated in the same period. Reveals which instruments you tend to invest in together."
			>
				<ChordDiagram positions={filtered.positions} {colorMap} />
			</ChartCard>
		</div>
	</section>
{/if}
