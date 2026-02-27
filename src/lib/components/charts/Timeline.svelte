<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition } from '$lib/etoro';
	import { COLORS, pnlColorScale, groupBySymbol } from '$lib/chart-utils';
	import { currency as fmt, shortDate as dateFmt, percent as pctFmt } from '$lib/format';

	let { positions }: { positions: EnrichedPosition[] } = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let hoveredPositionId: number | null = $state(null);
	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		symbol: string;
		openDate: string;
		amount: number;
		pnl: number | undefined;
		pnlPercent: number | undefined;
	}>({
		show: false,
		x: 0,
		y: 0,
		symbol: '',
		openDate: '',
		amount: 0,
		pnl: undefined,
		pnlPercent: undefined
	});

	const MARGINS = { top: 10, right: 20, bottom: 35, left: 80 };
	const ROW_HEIGHT = 28;
	const BAR_HEIGHT = 12;
	const MAX_SYMBOLS = 15;

	const chartHeight = $derived.by(() => {
		const groups = groupBySymbol(positions);
		const numSymbols = Math.min(MAX_SYMBOLS, groups.length);
		return Math.max(200, numSymbols * ROW_HEIGHT + 50);
	});

	$effect(() => {
		if (!containerEl) return;

		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) width = entry.contentRect.width;
		});
		resizeObserver.observe(containerEl);

		return () => resizeObserver.disconnect();
	});

	$effect(() => {
		if (!containerEl || width <= 0) return;

		const groups = groupBySymbol(positions);
		if (groups.length === 0) {
			d3.select(containerEl).selectAll('svg').remove();
			return;
		}
		const sorted = [...groups].sort((a, b) => b.totalAmount - a.totalAmount);
		const visible = sorted.slice(0, MAX_SYMBOLS);
		const hiddenCount = Math.max(0, sorted.length - MAX_SYMBOLS);

		const numSymbols = visible.length;
		const height = chartHeight;
		const innerWidth = width - MARGINS.left - MARGINS.right;
		const innerHeight = height - MARGINS.top - MARGINS.bottom;

		const today = new Date();
		const allPositions = visible.flatMap((g) => g.positions);
		const minDate =
			allPositions.length > 0
				? d3.min(allPositions, (p) => new Date(p.openDateTime)) ?? today
				: today;
		const maxDate = today;

		const xScale = d3
			.scaleTime()
			.domain([minDate, maxDate])
			.range([0, innerWidth]);

		const yScale = d3
			.scaleBand()
			.domain(visible.map((g) => g.symbol))
			.range([0, innerHeight])
			.paddingInner(0.2)
			.paddingOuter(0.1);

		const xAxis = d3
			.axisBottom(xScale)
			.ticks(8)
			.tickFormat((d) => d3.timeFormat('%b %Y')(d as Date));

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3
				.select(containerEl)
				.append('svg')
				.attr('width', width)
				.attr('height', height);
		} else {
			svg = svg.attr('width', width).attr('height', height);
		}

		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', `translate(${MARGINS.left},${MARGINS.top})`);

		// Horizontal gridlines between symbol rows
		const gridColor = d3.color(COLORS.border)!.copy({ opacity: 0.3 }).toString();
		visible.forEach((group, i) => {
			const y = yScale(group.symbol);
			if (y !== undefined) {
				const yPos = y + yScale.bandwidth();
				if (yPos < innerHeight) {
					g.append('line')
						.attr('x1', 0)
						.attr('x2', innerWidth)
						.attr('y1', yPos)
						.attr('y2', yPos)
						.attr('stroke', gridColor)
						.attr('stroke-width', 1);
				}
			}
		});

		// Y-axis labels
		visible.forEach((group) => {
			const y = yScale(group.symbol);
			if (y !== undefined) {
				const centerY = y + yScale.bandwidth() / 2;
				g.append('text')
					.attr('x', -8)
					.attr('y', centerY)
					.attr('text-anchor', 'end')
					.attr('dominant-baseline', 'middle')
					.attr('fill', COLORS.textPrimary)
					.attr('font-size', 11)
					.text(group.symbol);
			}
		});

		// Bars
		const currentHover = hoveredPositionId;
		visible.forEach((group) => {
			const bandY = yScale(group.symbol);
			if (bandY === undefined) return;

			const centerY = bandY + yScale.bandwidth() / 2;
			const barTop = centerY - BAR_HEIGHT / 2;

			group.positions.forEach((pos) => {
				const startDate = new Date(pos.openDateTime);
				const x = xScale(startDate);
				const endX = xScale(today);
				const barWidth = Math.max(2, endX - x);

				const rect = g
					.append('rect')
					.attr('x', x)
					.attr('y', barTop)
					.attr('width', barWidth)
					.attr('height', BAR_HEIGHT)
					.attr('rx', 3)
					.attr('fill', pnlColorScale(pos.pnlPercent ?? 0))
					.attr('opacity', () => (currentHover === pos.positionId ? 1 : 0.8))
					.style('cursor', 'pointer')
					.style('transition', 'opacity 0.15s');

				rect
					.on('mouseenter', function (event) {
						hoveredPositionId = pos.positionId;
						const rect = containerEl!.getBoundingClientRect();
						tooltip = {
							show: true,
							x: event.clientX - rect.left,
							y: event.clientY - rect.top,
							symbol: group.symbol,
							openDate: pos.openDateTime,
							amount: pos.amount,
							pnl: pos.pnl,
							pnlPercent: pos.pnlPercent
						};
					})
					.on('mousemove', function (event) {
						const rect = containerEl!.getBoundingClientRect();
						tooltip = {
							...tooltip,
							x: event.clientX - rect.left,
							y: event.clientY - rect.top
						};
					})
					.on('mouseleave', () => {
						hoveredPositionId = null;
						tooltip = { ...tooltip, show: false };
					});
			});
		});

		// X-axis
		const axisXG = g
			.append('g')
			.attr('class', 'axis axis-x')
			.attr('transform', `translate(0,${innerHeight})`);
		axisXG.call(xAxis);
		axisXG.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		axisXG.selectAll('path, line').attr('stroke', COLORS.border);

		// "and N more..." label
		if (hiddenCount > 0) {
			g.append('text')
				.attr('x', -8)
				.attr('y', innerHeight + 20)
				.attr('text-anchor', 'end')
				.attr('fill', COLORS.textSecondary)
				.attr('font-size', 10)
				.attr('font-style', 'italic')
				.text(`and ${hiddenCount} more...`);
		}
	});
</script>

<div class="relative" bind:this={containerEl} style="height: {chartHeight}px">
	{#if tooltip.show}
		<div
			class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="position: absolute; left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 text-text-secondary">Opened: {dateFmt.format(new Date(tooltip.openDate))}</div>
			<div class="mt-0.5 text-text-secondary">Invested: {fmt.format(tooltip.amount)}</div>
			{#if tooltip.pnl !== undefined || tooltip.pnlPercent !== undefined}
				<div class="mt-0.5 {tooltip.pnl !== undefined && tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
					P&L: {tooltip.pnl !== undefined ? (tooltip.pnl >= 0 ? '+' : '') + fmt.format(tooltip.pnl) : '—'}
					{#if tooltip.pnlPercent !== undefined}
						({tooltip.pnlPercent >= 0 ? '+' : ''}{pctFmt.format(tooltip.pnlPercent)}%)
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
