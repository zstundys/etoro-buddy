<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition, Candle } from '$lib/etoro-api';
	import { COLORS, symbolColor } from '$lib/chart-utils';
	import { currency as fmt, normalizeSymbol } from '$lib/format';

	let { positions, candleMap, credit = 0, colorMap = new Map() }: {
		positions: EnrichedPosition[];
		candleMap: Map<number, Candle[]>;
		credit: number;
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
		date: string;
		total: number;
		breakdown: { symbol: string; value: number }[];
	}>({ show: false, x: 0, y: 0, date: '', total: 0, breakdown: [] });

	const HEIGHT = 320;
	const MARGINS = { top: 10, right: 10, bottom: 30, left: 60 };

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

		const bySymbol = new Map<string, { instrumentId: number; units: number; openDate: Date }[]>();
		for (const p of positions) {
			if (!p.openDateTime) continue;
			const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
			if (!bySymbol.has(sym)) bySymbol.set(sym, []);
			bySymbol.get(sym)!.push({
				instrumentId: p.instrumentId,
				units: p.units * (p.isBuy ? 1 : -1),
				openDate: new Date(p.openDateTime)
			});
		}
		const symbols = [...bySymbol.keys()];
		if (symbols.length === 0) return;

		const allDates = new Set<string>();
		const priceMap = new Map<string, Map<number, number>>();
		for (const [instrumentId, candles] of candleMap) {
			for (const c of candles) {
				const dateKey = c.date.slice(0, 10);
				allDates.add(dateKey);
				if (!priceMap.has(dateKey)) priceMap.set(dateKey, new Map());
				priceMap.get(dateKey)!.set(instrumentId, c.close);
			}
		}

		const minCoverage = Math.ceil(candleMap.size * 0.5);
		const sortedDates = [...allDates].sort().map((d) => new Date(d)).filter((date) => {
			const prices = priceMap.get(date.toISOString().slice(0, 10));
			return prices != null && prices.size >= minCoverage;
		});
		if (sortedDates.length === 0) return;

		const data = sortedDates.map((date) => {
			const dateKey = date.toISOString().slice(0, 10);
			const prices = priceMap.get(dateKey);
			const row: Record<string, number | Date> = { date };
			for (const sym of symbols) {
				let val = 0;
				for (const pos of bySymbol.get(sym)!) {
					if (date < pos.openDate) continue;
					const price = prices?.get(pos.instrumentId);
					if (price !== undefined) val += pos.units * price;
				}
				row[sym] = Math.max(0, val);
			}
			return row;
		});

		const innerWidth = width - MARGINS.left - MARGINS.right;
		const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

		const xScale = d3.scaleTime()
			.domain([sortedDates[0], sortedDates[sortedDates.length - 1]])
			.range([0, innerWidth]);

		const hasSelection = sel.size > 0;
		const visibleSymbols = hasSelection ? symbols.filter((s) => sel.has(s)) : symbols;

		const stack = d3.stack<Record<string, number | Date>>()
			.keys(visibleSymbols)
			.offset(d3.stackOffsetNone)
			.order(d3.stackOrderNone);
		const stacked = stack(data);

		const yMax = (d3.max(stacked, (s) => d3.max(s, (d) => d[1])) ?? 1) * 1.05;
		const yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

		const area = d3.area<d3.SeriesPoint<Record<string, number | Date>>>()
			.x((d) => xScale((d.data as Record<string, Date>).date))
			.y0((d) => yScale(d[0]))
			.y1((d) => yScale(d[1]))
			.curve(d3.curveMonotoneX);

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3.select(containerEl).append('svg').attr('width', width).attr('height', HEIGHT);
		} else {
			svg.attr('width', width).attr('height', HEIGHT);
		}
		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', `translate(${MARGINS.left},${MARGINS.top})`);

		stacked.forEach((series) => {
			const key = series.key;
			g.append('path')
				.datum(series)
				.attr('fill', symbolColor(key, colorMap))
				.attr('d', area)
				.attr('opacity', currentHover === null ? 0.85 : currentHover === key ? 1 : 0.2)
				.style('transition', 'opacity 0.2s');
		});

		const xAxis = d3.axisBottom(xScale).ticks(Math.min(8, sortedDates.length))
			.tickFormat((d) => d3.timeFormat('%b %d')(d as Date));
		const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat((d) => `$${d3.format(',.0f')(d as number)}`);

		g.append('g').attr('transform', `translate(0,${innerHeight})`).call(xAxis)
			.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		g.append('g').call(yAxis)
			.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		g.selectAll('.domain, .tick line').attr('stroke', COLORS.border);

		const bisect = d3.bisector((d: Record<string, number | Date>) => d.date as Date).left;
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
				const i = Math.min(bisect(data, x0), data.length - 1);
				const row = data[i];
				const xPos = xScale(row.date as Date);
				crosshair.attr('x1', xPos).attr('x2', xPos).attr('opacity', 1);

				const breakdown = visibleSymbols.map((sym) => ({
					symbol: sym,
					value: (row[sym] as number) ?? 0
				})).filter((b) => b.value > 0);
				const total = breakdown.reduce((s, b) => s + b.value, 0) + credit;

				tooltip = {
					show: true,
					x: event.clientX,
					y: event.clientY,
					date: d3.timeFormat('%b %d, %Y')(row.date as Date),
					total,
					breakdown
				};
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
		{@const symbols = [...new Set(positions.filter((p) => p.openDateTime).map((p) => normalizeSymbol(p.symbol ?? `#${p.instrumentId}`)))]}
		{@const hasSelection = selected.size > 0}
		<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
			{#each symbols as symbol (symbol)}
				{@const active = !hasSelection || selected.has(symbol)}
				<button
					type="button"
					class="flex items-center gap-1.5 text-xs transition-colors hover:text-text-primary"
					class:text-text-primary={active}
					class:text-text-secondary={!active}
					class:opacity-40={!active}
					onclick={() => toggleSymbol(symbol)}
					onmouseenter={() => (hoveredSymbol = symbol)}
					onmouseleave={() => (hoveredSymbol = null)}
				>
					<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {symbolColor(symbol, colorMap)}"></span>
					<span>{symbol}</span>
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
			<div class="font-semibold text-text-primary">{tooltip.date}</div>
			<div class="mt-1 text-text-secondary">Total: {fmt.format(tooltip.total)}</div>
			{#each tooltip.breakdown.slice(0, 8) as item (item.symbol)}
				<div class="mt-0.5 flex items-center gap-1.5">
					<span class="h-2 w-2 rounded-full" style="background-color: {symbolColor(item.symbol, colorMap)}"></span>
					<span class="text-text-secondary">{item.symbol}: {fmt.format(item.value)}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
