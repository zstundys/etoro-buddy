<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition, Candle } from '$lib/etoro-api';
	import { COLORS, symbolColor, groupBySymbol } from '$lib/chart-utils';
	import { currency as fmt, normalizeSymbol } from '$lib/format';

	let { positions, candleMap, colorMap = new Map() }: {
		positions: EnrichedPosition[];
		candleMap: Map<number, Candle[]>;
		colorMap?: Map<string, string>;
	} = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let hoveredSymbol = $state<string | null>(null);
	let selected = $state<Set<string>>(new Set());

	function toggleSymbol(sym: string) {
		const next = new Set(selected);
		if (next.has(sym)) next.delete(sym); else next.add(sym);
		selected = next;
	}

	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		symbol: string;
		date: string;
		price: number;
		volume: string;
	}>({ show: false, x: 0, y: 0, symbol: '', date: '', price: 0, volume: '' });

	const HEIGHT = 300;
	const MARGINS = { top: 10, right: 10, bottom: 30, left: 55 };
	const MIN_WIDTH = 1;
	const MAX_WIDTH = 6;

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) width = entry.contentRect.width;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!containerEl || width <= 0 || positions.length === 0 || candleMap.size === 0) return;
		const currentHover = hoveredSymbol;
		const sel = selected;

		const groups = groupBySymbol(positions);
		type RibbonSeries = {
			symbol: string;
			openRate: number;
			data: { date: Date; close: number; normVol: number; volume: number }[];
		};
		const series: RibbonSeries[] = [];

		for (const g of groups) {
			const rep = g.positions[0];
			const candles = candleMap.get(rep.instrumentId);
			if (!candles || candles.length < 2) continue;
			const openRate = g.positions.reduce((s, p) => s + p.openRate * p.amount, 0) /
				g.positions.reduce((s, p) => s + p.amount, 0);

			const maxVol = d3.max(candles, (c) => c.volume) ?? 1;
			series.push({
				symbol: g.symbol,
				openRate,
				data: candles.map((c) => ({
					date: new Date(c.date),
					close: c.close,
					normVol: maxVol > 0 ? c.volume / maxVol : 0,
					volume: c.volume
				}))
			});
		}

		if (series.length === 0) return;

		const hasSelection = sel.size > 0;
		const visibleSeries = hasSelection ? series.filter((s) => sel.has(s.symbol)) : series;

		const innerWidth = width - MARGINS.left - MARGINS.right;
		const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

		const allDates = series.flatMap((s) => s.data.map((d) => d.date));

		const useNormalized = series.length > 1;
		let yDomain: [number, number];
		if (useNormalized) {
			const visiblePcts = visibleSeries.flatMap((s) =>
				s.data.map((d) => ((d.close - s.openRate) / s.openRate) * 100)
			);
			const lo = d3.min(visiblePcts) ?? -10;
			const hi = d3.max(visiblePcts) ?? 10;
			yDomain = [lo - 2, hi + 2];
		} else {
			const visiblePrices = visibleSeries.flatMap((s) => s.data.map((d) => d.close));
			const lo = d3.min(visiblePrices) ?? 0;
			const hi = d3.max(visiblePrices) ?? 100;
			const pad = (hi - lo) * 0.08 || 1;
			yDomain = [lo - pad, hi + pad];
		}

		const xScale = d3.scaleTime().domain(d3.extent(allDates) as [Date, Date]).range([0, innerWidth]);
		const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3.select(containerEl).append('svg').attr('width', width).attr('height', HEIGHT);
		} else {
			svg.attr('width', width).attr('height', HEIGHT);
		}
		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', `translate(${MARGINS.left},${MARGINS.top})`);

		for (const s of series) {
			const isVisible = !hasSelection || sel.has(s.symbol);
			const isHoverTarget = currentHover === s.symbol;
			const getY = (d: (typeof s.data)[number]) =>
				useNormalized ? ((d.close - s.openRate) / s.openRate) * 100 : d.close;

			const ribbonArea = d3.area<(typeof s.data)[number]>()
				.x((d) => xScale(d.date))
				.y0((d) => {
					const hw = MIN_WIDTH + d.normVol * (MAX_WIDTH - MIN_WIDTH);
					return yScale(getY(d)) + hw;
				})
				.y1((d) => {
					const hw = MIN_WIDTH + d.normVol * (MAX_WIDTH - MIN_WIDTH);
					return yScale(getY(d)) - hw;
				})
				.curve(d3.curveMonotoneX);

			const color = symbolColor(s.symbol, colorMap);
			const fillOpacity = !isVisible ? 0.03 : (isHoverTarget || currentHover === null) ? 0.35 : 0.12;

			g.append('path')
				.datum(s.data)
				.attr('fill', d3.color(color)!.copy({ opacity: fillOpacity }).toString())
				.attr('d', ribbonArea)
				.style('transition', 'fill 0.2s');

			const centerLine = d3.line<(typeof s.data)[number]>()
				.x((d) => xScale(d.date))
				.y((d) => yScale(getY(d)))
				.curve(d3.curveMonotoneX);

			g.append('path')
				.datum(s.data)
				.attr('fill', 'none')
				.attr('stroke', color)
				.attr('stroke-width', isHoverTarget ? 2.5 : isVisible ? 1.5 : 0.5)
				.attr('opacity', !isVisible ? 0.08 : (currentHover === null || isHoverTarget) ? 1 : 0.3)
				.attr('d', centerLine)
				.style('transition', 'opacity 0.2s, stroke-width 0.2s');

			if (useNormalized) {
				const entryY = yScale(0);
				if (entryY >= 0 && entryY <= innerHeight) {
					g.append('line')
						.attr('x1', 0).attr('x2', innerWidth)
						.attr('y1', entryY).attr('y2', entryY)
						.attr('stroke', COLORS.textSecondary)
						.attr('stroke-dasharray', '4,4')
						.attr('stroke-width', 0.5);
				}
			} else if (isVisible) {
				const entryY = yScale(s.openRate);
				if (entryY >= 0 && entryY <= innerHeight) {
					g.append('line')
						.attr('x1', 0).attr('x2', innerWidth)
						.attr('y1', entryY).attr('y2', entryY)
						.attr('stroke', COLORS.textSecondary)
						.attr('stroke-dasharray', '4,4')
						.attr('stroke-width', 0.5);
				}
			}
		}

		const xAxis = d3.axisBottom(xScale).ticks(Math.min(8, allDates.length))
			.tickFormat((d) => d3.timeFormat('%b %d')(d as Date));
		const yAxis = d3.axisLeft(yScale).ticks(5)
			.tickFormat((d) => useNormalized ? `${Number(d)}%` : `$${d3.format(',.0f')(d as number)}`);

		g.append('g').attr('transform', `translate(0,${innerHeight})`).call(xAxis)
			.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		g.append('g').call(yAxis)
			.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		g.selectAll('.domain, .tick line').attr('stroke', COLORS.border);

		const overlay = g.append('rect')
			.attr('width', innerWidth).attr('height', innerHeight)
			.attr('fill', 'none').attr('pointer-events', 'all');

		const crosshair = g.append('line')
			.attr('y1', 0).attr('y2', innerHeight)
			.attr('stroke', COLORS.textSecondary).attr('stroke-dasharray', '3,3')
			.attr('opacity', 0);

		overlay
			.on('mousemove', function (event) {
				const [mx] = d3.pointer(event);
				const x0 = xScale.invert(mx);
				crosshair.attr('x1', xScale(x0)).attr('x2', xScale(x0)).attr('opacity', 1);

				let closest: { symbol: string; date: Date; price: number; volume: number; dist: number } | null = null;
				const tooltipSeries = hasSelection ? visibleSeries : series;
				for (const s of tooltipSeries) {
					const bisect = d3.bisector((d: (typeof s.data)[number]) => d.date).left;
					const i = Math.min(bisect(s.data, x0), s.data.length - 1);
					const d = s.data[i];
					const getY = useNormalized ? ((d.close - s.openRate) / s.openRate) * 100 : d.close;
					const [, my] = d3.pointer(event);
					const dist = Math.abs(yScale(getY) - my);
					if (!closest || dist < closest.dist) {
						closest = { symbol: s.symbol, date: d.date, price: d.close, volume: d.volume, dist };
					}
				}

				if (closest) {
					tooltip = {
						show: true,
						x: event.clientX,
						y: event.clientY,
						symbol: closest.symbol,
						date: d3.timeFormat('%b %d, %Y')(closest.date),
						price: closest.price,
						volume: d3.format(',.0f')(closest.volume)
					};
				}
			})
			.on('mouseleave', () => {
				crosshair.attr('opacity', 0);
				tooltip = { ...tooltip, show: false };
			});
	});
</script>

<div class="relative flex flex-col">
	<div bind:this={containerEl} style="height: {HEIGHT}px"></div>
	{#if positions.length > 0 && candleMap.size > 0}
		{@const groups = groupBySymbol(positions)}
		{@const hasSelection = selected.size > 0}
		<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
			{#each groups as g (g.symbol)}
				{@const active = !hasSelection || selected.has(g.symbol)}
				<button
					type="button"
					class="flex items-center gap-1.5 text-xs transition-colors hover:text-text-primary"
					class:text-text-primary={active}
					class:text-text-secondary={!active}
					class:opacity-40={!active}
					onclick={() => toggleSymbol(g.symbol)}
					onmouseenter={() => (hoveredSymbol = g.symbol)}
					onmouseleave={() => (hoveredSymbol = null)}
				>
					<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {symbolColor(g.symbol, colorMap)}"></span>
					<span>{g.symbol}</span>
				</button>
			{/each}
			{#if hasSelection}
				<button
					type="button"
					class="text-[10px] text-text-secondary underline decoration-dotted hover:text-text-primary"
					onclick={() => (selected = new Set())}
				>
					clear
				</button>
			{/if}
		</div>
	{/if}
	{#if tooltip.show}
		<div
			class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 text-text-secondary">{tooltip.date}</div>
			<div class="mt-0.5 text-text-secondary">Price: {fmt.format(tooltip.price)}</div>
			<div class="mt-0.5 text-text-secondary">Volume: {tooltip.volume}</div>
		</div>
	{/if}
</div>
