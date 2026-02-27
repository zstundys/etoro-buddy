<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition } from '$lib/etoro';
	import { COLORS } from '$lib/chart-utils';
	import { currency as fmt, percent as pctFmt, normalizeSymbol } from '$lib/format';

	let { positions }: { positions: EnrichedPosition[] } = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		symbol: string;
		leverage: number;
		amount: number;
		pnl: number | undefined;
		pnlPercent: number | undefined;
	}>({
		show: false,
		x: 0,
		y: 0,
		symbol: '',
		leverage: 1,
		amount: 0,
		pnl: undefined,
		pnlPercent: undefined
	});

	const HEIGHT = 350;
	const MARGINS = { top: 20, right: 20, bottom: 35, left: 55 };

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

		const innerWidth = width - MARGINS.left - MARGINS.right;
		const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

		const data = positions.map((p) => ({
			...p,
			pnlPct: p.pnlPercent ?? 0
		}));

		const xExtent = d3.extent(data, (d) => d.leverage) as [number, number];
		const yExtent = d3.extent(data, (d) => d.pnlPct) as [number, number];
		const amountExtent = d3.extent(data, (d) => d.amount) as [number, number];

		const xMin = xExtent[0] !== undefined ? Math.min(xExtent[0], 1) : 1;
		const xMax = xExtent[1] !== undefined ? Math.max(xExtent[1], 1) : 1;
		const xDomain: [number, number] = xMin === xMax ? [0.5, 1.5] : [xMin, xMax];
		const yMin = yExtent[0] !== undefined ? Math.min(yExtent[0], 0) : -10;
		const yMax = yExtent[1] !== undefined ? Math.max(yExtent[1], 0) : 10;
		const yDomain: [number, number] = [yMin, yMax];
		const amountDomain =
			amountExtent[0] !== undefined && amountExtent[1] !== undefined ? amountExtent : [0, 1];

		const xScale = d3.scaleLinear().domain(xDomain).range([0, innerWidth]);
		const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);
		const rScale = d3.scaleSqrt().domain(amountDomain).range([4, 25]);

		const xAxis = d3
			.axisBottom(xScale)
			.ticks(5)
			.tickFormat((d) => `${Number(d)}x`);
		const yAxis = d3
			.axisLeft(yScale)
			.ticks(5)
			.tickFormat((d) => `${Number(d)}%`);

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3
				.select(containerEl)
				.append('svg')
				.attr('width', width)
				.attr('height', HEIGHT);
		} else {
			svg = svg.attr('width', width).attr('height', HEIGHT);
		}

		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', `translate(${MARGINS.left},${MARGINS.top})`);

		// Gridlines (border color, 0.3 opacity)
		g.append('g')
			.attr('class', 'grid grid-x')
			.attr('transform', `translate(0,${innerHeight})`)
			.call(
				d3
					.axisBottom(xScale)
					.ticks(5)
					.tickSize(-innerHeight)
					.tickFormat(() => '')
			)
			.selectAll('line')
			.attr('stroke', COLORS.border)
			.attr('stroke-opacity', 0.3);

		g.append('g')
			.attr('class', 'grid grid-y')
			.call(
				d3
					.axisLeft(yScale)
					.ticks(5)
					.tickSize(-innerWidth)
					.tickFormat(() => '')
			)
			.selectAll('line')
			.attr('stroke', COLORS.border)
			.attr('stroke-opacity', 0.3);

		// Reference lines: vertical at x=1, horizontal at y=0
		const x1 = xScale(1);
		if (x1 >= 0 && x1 <= innerWidth) {
			g.append('line')
				.attr('x1', x1)
				.attr('x2', x1)
				.attr('y1', 0)
				.attr('y2', innerHeight)
				.attr('stroke', COLORS.textSecondary)
				.attr('stroke-dasharray', '4,4')
				.attr('stroke-opacity', 0.5)
				.attr('stroke-width', 1);
		}
		const y0 = yScale(0);
		if (y0 >= 0 && y0 <= innerHeight) {
			g.append('line')
				.attr('x1', 0)
				.attr('x2', innerWidth)
				.attr('y1', y0)
				.attr('y2', y0)
				.attr('stroke', COLORS.textSecondary)
				.attr('stroke-dasharray', '4,4')
				.attr('stroke-opacity', 0.5)
				.attr('stroke-width', 1);
		}

		// Quadrant labels (10px, text-secondary, 0.3 opacity)
		const labelStyle = {
			fill: COLORS.textSecondary,
			'font-size': '10px',
			'font-weight': 'normal',
			opacity: 0.3
		};
		g.append('text')
			.attr('x', 8)
			.attr('y', 12)
			.attr('text-anchor', 'start')
			.text('Low Risk / Gain')
			.attr('fill', labelStyle.fill)
			.attr('font-size', labelStyle['font-size'])
			.attr('opacity', labelStyle.opacity);
		g.append('text')
			.attr('x', innerWidth - 8)
			.attr('y', 12)
			.attr('text-anchor', 'end')
			.text('High Risk / Gain')
			.attr('fill', labelStyle.fill)
			.attr('font-size', labelStyle['font-size'])
			.attr('opacity', labelStyle.opacity);
		g.append('text')
			.attr('x', 8)
			.attr('y', innerHeight - 6)
			.attr('text-anchor', 'start')
			.text('Low Risk / Loss')
			.attr('fill', labelStyle.fill)
			.attr('font-size', labelStyle['font-size'])
			.attr('opacity', labelStyle.opacity);
		g.append('text')
			.attr('x', innerWidth - 8)
			.attr('y', innerHeight - 6)
			.attr('text-anchor', 'end')
			.text('High Risk / Loss')
			.attr('fill', labelStyle.fill)
			.attr('font-size', labelStyle['font-size'])
			.attr('opacity', labelStyle.opacity);

		// Axes
		const axisXG = g
			.append('g')
			.attr('class', 'axis axis-x')
			.attr('transform', `translate(0,${innerHeight})`);
		axisXG.call(xAxis);
		axisXG.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		axisXG.selectAll('path, line').attr('stroke', COLORS.border);

		const axisYG = g.append('g').attr('class', 'axis axis-y');
		axisYG.call(yAxis);
		axisYG.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		axisYG.selectAll('path, line').attr('stroke', COLORS.border);

		// Bubbles: gain (#22c55e) for pnlPercent >= 0, loss (#ef4444) for < 0, opacity 0.7
		// 1px stroke (same color as fill but darker)
		const circles = g
			.selectAll<SVGCircleElement, (typeof data)[number]>('circle.bubble')
			.data(data, (d) => `${d.positionId}`)
			.join('circle')
			.attr('class', 'bubble')
			.attr('cx', (d) => xScale(d.leverage))
			.attr('cy', (d) => yScale(d.pnlPct))
			.attr('r', (d) => rScale(d.amount))
			.attr('fill', (d) => {
				const base = d.pnlPct >= 0 ? COLORS.gain : COLORS.loss;
				return d3.color(base)!.copy({ opacity: 0.7 }).toString();
			})
			.attr('stroke', (d) => {
				const base = d.pnlPct >= 0 ? COLORS.gain : COLORS.loss;
				return d3.color(base)!.darker(0.5).toString();
			})
			.attr('stroke-width', 1)
			.style('cursor', 'pointer');

		circles
			.on('mouseenter', function (event, d) {
				const rect = containerEl!.getBoundingClientRect();
				tooltip = {
					show: true,
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
					symbol: normalizeSymbol(d.symbol ?? `#${d.instrumentId}`),
					leverage: d.leverage,
					amount: d.amount,
					pnl: d.pnl,
					pnlPercent: d.pnlPercent
				};
			})
			.on('mousemove', function (event) {
				const rect = containerEl!.getBoundingClientRect();
				tooltip = { ...tooltip, x: event.clientX - rect.left, y: event.clientY - rect.top };
			})
			.on('mouseleave', () => {
				tooltip = { ...tooltip, show: false };
			});
	});

	const allAt1x = $derived(
		positions.length > 0 && positions.every((p) => p.leverage === 1)
	);
</script>

<div class="relative" bind:this={containerEl} style="height: {HEIGHT}px">
	{#if allAt1x}
		<div
			class="absolute left-1/2 top-4 -translate-x-1/2 rounded bg-surface-overlay/80 px-3 py-1.5 text-xs text-text-secondary"
			role="note"
		>
			All positions at 1x leverage
		</div>
	{/if}
	{#if tooltip.show}
		<div
			class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="position: absolute; left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 text-text-secondary">Leverage: {tooltip.leverage}x</div>
			<div class="mt-0.5 text-text-secondary">Invested: {fmt.format(tooltip.amount)}</div>
			{#if tooltip.pnlPercent !== undefined}
				<div class="mt-0.5 {tooltip.pnlPercent >= 0 ? 'text-gain' : 'text-loss'}">
					P&L%: {tooltip.pnlPercent >= 0 ? '+' : ''}{pctFmt.format(tooltip.pnlPercent)}%
				</div>
			{/if}
			{#if tooltip.pnl !== undefined}
				<div class="mt-0.5 {tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
					P&L: {tooltip.pnl >= 0 ? '+' : ''}{fmt.format(tooltip.pnl)}
				</div>
			{/if}
		</div>
	{/if}
</div>
