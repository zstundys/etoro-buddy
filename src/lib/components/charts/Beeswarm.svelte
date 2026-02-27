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
		amount: number;
		pnl: number | undefined;
		pnlPercent: number | undefined;
	}>({
		show: false,
		x: 0,
		y: 0,
		symbol: '',
		amount: 0,
		pnl: undefined,
		pnlPercent: undefined
	});

	const HEIGHT = 250;
	const MARGINS = { top: 10, right: 20, bottom: 30, left: 20 };

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

		if (data.length === 0) {
			d3.select(containerEl).selectAll('svg').remove();
			return;
		}

		const pnlExtent = d3.extent(data, (d) => d.pnlPct) as [number, number];
		const pnlMin = pnlExtent[0] !== undefined ? Math.min(pnlExtent[0], 0) : -10;
		const pnlMax = pnlExtent[1] !== undefined ? Math.max(pnlExtent[1], 0) : 10;
		const pnlDomain: [number, number] = [pnlMin, pnlMax];

		const amountExtent = d3.extent(data, (d) => d.amount) as [number, number];
		const amountDomain: [number, number] =
			amountExtent[0] !== undefined && amountExtent[1] !== undefined ? amountExtent : [0, 1];

		const xScale = d3.scaleLinear().domain(pnlDomain).range([0, innerWidth]);
		const rScale = d3.scaleSqrt().domain(amountDomain).range([3, 18]);

		const nodes = data.map((d) => ({
			...d,
			x: xScale(d.pnlPct),
			y: innerHeight / 2,
			radius: rScale(d.amount)
		}));

		const simulation = d3
			.forceSimulation(nodes)
			.force('x', d3.forceX((d) => xScale((d as (typeof nodes)[0]).pnlPct)).strength(0.3))
			.force('y', d3.forceY(innerHeight / 2).strength(0.1))
			.force('collide', d3.forceCollide((d) => (d as (typeof nodes)[0]).radius + 1));

		simulation.tick(120);

		const xAxis = d3
			.axisBottom(xScale)
			.ticks(6)
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

		// Vertical zero line
		const zeroX = xScale(0);
		if (zeroX >= 0 && zeroX <= innerWidth) {
			g.append('line')
				.attr('x1', zeroX)
				.attr('x2', zeroX)
				.attr('y1', 0)
				.attr('y2', innerHeight)
				.attr('stroke', COLORS.textSecondary)
				.attr('stroke-dasharray', '4,4')
				.attr('stroke-width', 1);
		}

		// Circles
		const circles = g
			.selectAll<SVGCircleElement, (typeof nodes)[0]>('circle.bee')
			.data(nodes, (d) => `${d.positionId}`)
			.join('circle')
			.attr('class', 'bee')
			.attr('cx', (d) => d.x)
			.attr('cy', (d) => d.y)
			.attr('r', (d) => d.radius)
			.attr('fill', (d) => {
				const base = d.pnlPct >= 0 ? COLORS.gain : COLORS.loss;
				return d3.color(base)!.copy({ opacity: 0.75 }).toString();
			})
			.attr('stroke', (d) => {
				const base = d.pnlPct >= 0 ? COLORS.gain : COLORS.loss;
				return d3.color(base)!.darker(0.5).toString();
			})
			.attr('stroke-width', 0.5)
			.style('cursor', 'pointer');

		circles
			.on('mouseenter', function (event, d) {
				const rect = containerEl!.getBoundingClientRect();
				tooltip = {
					show: true,
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
					symbol: normalizeSymbol(d.symbol ?? `#${d.instrumentId}`),
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

		// X-axis
		const axisXG = g
			.append('g')
			.attr('class', 'axis axis-x')
			.attr('transform', `translate(0,${innerHeight})`);
		axisXG.call(xAxis);
		axisXG.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		axisXG.selectAll('path, line').attr('stroke', COLORS.border);
	});
</script>

<div class="relative" bind:this={containerEl} style="height: {HEIGHT}px">
	{#if tooltip.show}
		<div
			class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="position: absolute; left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 text-text-secondary">Invested: {fmt.format(tooltip.amount)}</div>
			{#if tooltip.pnl !== undefined}
				<div class="mt-0.5 {tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
					P&L: {tooltip.pnl >= 0 ? '+' : ''}{fmt.format(tooltip.pnl)}
					{#if tooltip.pnlPercent !== undefined}
						({tooltip.pnlPercent >= 0 ? '+' : ''}{pctFmt.format(tooltip.pnlPercent)}%)
					{/if}
				</div>
			{:else if tooltip.pnlPercent !== undefined}
				<div class="mt-0.5 {tooltip.pnlPercent >= 0 ? 'text-gain' : 'text-loss'}">
					P&L%: {tooltip.pnlPercent >= 0 ? '+' : ''}{pctFmt.format(tooltip.pnlPercent)}%
				</div>
			{/if}
		</div>
	{/if}
</div>
