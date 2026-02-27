<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition } from '$lib/etoro-api';
	import { COLORS } from '$lib/chart-utils';
	import { currency as fmt, normalizeSymbol } from '$lib/format';

	let { positions }: { positions: EnrichedPosition[] } = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		symbol: string;
		amount: number;
		runningTotal: number;
	}>({
		show: false,
		x: 0,
		y: 0,
		symbol: '',
		amount: 0,
		runningTotal: 0
	});

	const HEIGHT = 300;
	const MARGINS = { top: 15, right: 15, bottom: 60, left: 55 };

	type WaterfallItem = {
		key: string;
		symbol: string;
		totalFees: number;
		absValue: number;
		start: number;
		end: number;
		isNet: boolean;
	};

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

		const filtered = positions.filter((p) => p.totalFees !== 0);
		const sorted = [...filtered].sort((a, b) => b.totalFees - a.totalFees);

		if (sorted.length === 0) {
			d3.select(containerEl).selectAll('svg').remove();
			d3.select(containerEl).selectAll('.empty-state').remove();
			const empty = d3.select(containerEl).append('div').attr('class', 'empty-state');
			empty
				.style('display', 'flex')
				.style('align-items', 'center')
				.style('justify-content', 'center')
				.style('height', `${HEIGHT}px`)
				.style('color', COLORS.textSecondary)
				.style('font-size', '14px')
				.text('No fees or dividends');
			return;
		}

		d3.select(containerEl).selectAll('.empty-state').remove();

		let runningTotal = 0;
		const items: WaterfallItem[] = sorted.map((p) => {
			const impact = -p.totalFees;
			const start = runningTotal;
			runningTotal += impact;
			const end = runningTotal;
			return {
				key: `pos-${p.positionId}`,
				symbol: normalizeSymbol(p.symbol ?? `#${p.instrumentId}`),
				totalFees: impact,
				absValue: Math.abs(impact),
				start,
				end,
				isNet: false
			};
		});

		items.push({
			key: 'net',
			symbol: 'Net',
			totalFees: runningTotal,
			absValue: Math.abs(runningTotal),
			start: 0,
			end: runningTotal,
			isNet: true
		});

		const innerWidth = width - MARGINS.left - MARGINS.right;
		const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

		const allValues = items.flatMap((d) => [d.start, d.end]);
		const yMin = Math.min(0, ...allValues);
		const yMax = Math.max(0, ...allValues);
		const yPadding = (yMax - yMin) * 0.05 || 1;
		const yDomain: [number, number] = [yMin - yPadding, yMax + yPadding];

		const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

		const domain = items.map((d) => d.symbol);
		const xScale = d3
			.scaleBand()
			.domain(domain)
			.range([0, innerWidth])
			.paddingInner(0.2)
			.paddingOuter(0.1);

		const band = xScale.bandwidth();
		const barWidth = Math.max(8, band);

		const rotateLabels = domain.length > 6;

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

		// Y-axis
		const yAxis = d3
			.axisLeft(yScale)
			.ticks(6)
			.tickFormat((d) => fmt.format(Number(d)));

		const axisYG = g.append('g').attr('class', 'axis axis-y');
		axisYG.call(yAxis);
		axisYG.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		axisYG.selectAll('path, line').attr('stroke', COLORS.border);

		// Zero line
		const zeroY = yScale(0);
		if (zeroY >= 0 && zeroY <= innerHeight) {
			g.append('line')
				.attr('x1', 0)
				.attr('x2', innerWidth)
				.attr('y1', zeroY)
				.attr('y2', zeroY)
				.attr('stroke', COLORS.textSecondary)
				.attr('stroke-dasharray', '4,4')
				.attr('stroke-width', 1);
		}

		// Connector lines
		for (let i = 0; i < items.length - 1; i++) {
			const curr = items[i];
			const next = items[i + 1];
			const xBand = xScale(curr.symbol);
			const nextXBand = xScale(next.symbol);
			if (xBand !== undefined && nextXBand !== undefined) {
				const barCenterX = xBand + band / 2;
				const nextBarCenterX = nextXBand + band / 2;
				const connectorY = yScale(curr.end);
				g.append('line')
					.attr('x1', barCenterX + barWidth / 2)
					.attr('x2', nextBarCenterX - barWidth / 2)
					.attr('y1', connectorY)
					.attr('y2', connectorY)
					.attr('stroke', COLORS.border)
					.attr('stroke-width', 1);
			}
		}

		// Bars
		const bars = g
			.selectAll<SVGRectElement, WaterfallItem>('rect.waterfall-bar')
			.data(items, (d) => d.key)
			.join('rect')
			.attr('class', 'waterfall-bar')
			.attr('x', (d) => {
				const xBand = xScale(d.symbol);
				return xBand !== undefined ? xBand + (band - barWidth) / 2 : 0;
			})
			.attr('width', barWidth)
			.attr('y', (d) => {
				const top = yScale(Math.max(d.start, d.end));
				return top;
			})
			.attr('height', (d) => {
				const top = yScale(Math.max(d.start, d.end));
				const bottom = yScale(Math.min(d.start, d.end));
				return Math.max(0, bottom - top);
			})
			.attr('fill', (d) => {
				if (d.isNet) return d.end >= 0 ? COLORS.gain : COLORS.loss;
				return d.totalFees > 0 ? COLORS.gain : COLORS.loss;
			})
			.attr('rx', (d) => {
				const isUp = d.end > d.start;
				return 2;
			})
			.attr('ry', 2)
			.style('cursor', 'pointer');

		bars
			.on('mouseenter', function (event, d) {
				tooltip = {
					show: true,
					x: event.clientX,
					y: event.clientY,
					symbol: d.symbol,
					amount: d.totalFees,
					runningTotal: d.end
				};
			})
			.on('mousemove', function (event) {
				tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
			})
			.on('mouseleave', () => {
				tooltip = { ...tooltip, show: false };
			});

		// X-axis
		const axisXG = g
			.append('g')
			.attr('class', 'axis axis-x')
			.attr('transform', `translate(0,${innerHeight})`);

		const xAxis = d3.axisBottom(xScale).tickFormat((d) => d);
		axisXG.call(xAxis);
		axisXG.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);

		if (rotateLabels) {
			axisXG
				.selectAll('text')
				.attr('transform', 'rotate(-45)')
				.attr('text-anchor', 'end')
				.attr('dx', '-0.5em')
				.attr('dy', '0.5em');
		}

		axisXG.selectAll('path, line').attr('stroke', COLORS.border);
	});
</script>

<div class="relative" bind:this={containerEl} style="height: {HEIGHT}px">
	{#if tooltip.show}
		<div
			class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 {tooltip.amount > 0 ? 'text-gain' : 'text-loss'}">
				{tooltip.amount > 0 ? 'Dividend' : 'Fee'}: {fmt.format(tooltip.amount)}
			</div>
			<div class="mt-0.5 text-text-secondary">Running total: {fmt.format(tooltip.runningTotal)}</div>
		</div>
	{/if}
</div>
