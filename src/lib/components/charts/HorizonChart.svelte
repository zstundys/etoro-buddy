<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition, Candle } from '$lib/etoro-api';
	import { COLORS, groupBySymbol } from '$lib/chart-utils';
	import { percent as pctFmt, currency as currFmt } from '$lib/format';

	let { positions, candleMap, colorMap = new Map() }: {
		positions: EnrichedPosition[];
		candleMap: Map<number, Candle[]>;
		colorMap?: Map<string, string>;
	} = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		symbol: string;
		date: string;
		pct: number;
		price: number;
	}>({ show: false, x: 0, y: 0, symbol: '', date: '', pct: 0, price: 0 });

	const BAND_HEIGHT = 28;
	const BANDS = 3;
	const MARGINS = { top: 5, right: 10, bottom: 25, left: 70 };

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) width = entry.contentRect.width;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	const chartHeight = $derived.by(() => {
		if (positions.length === 0 || candleMap.size === 0) return 100;
		const groups = groupBySymbol(positions);
		const count = groups.filter((g) => candleMap.has(g.positions[0].instrumentId)).length;
		return Math.max(100, count * BAND_HEIGHT + MARGINS.top + MARGINS.bottom);
	});

	$effect(() => {
		if (!containerEl || width <= 0 || positions.length === 0 || candleMap.size === 0) return;

		const groups = groupBySymbol(positions);
		type StripData = {
			symbol: string;
			data: { date: Date; pct: number; close: number }[];
		};
		const strips: StripData[] = [];

		for (const g of groups) {
			const rep = g.positions[0];
			const candles = candleMap.get(rep.instrumentId);
			if (!candles || candles.length === 0) continue;
			const openRate = g.positions.reduce((s, p) => s + p.openRate * p.amount, 0) /
				g.positions.reduce((s, p) => s + p.amount, 0);
			if (openRate <= 0) continue;

			strips.push({
				symbol: g.symbol,
				data: candles.map((c) => ({
					date: new Date(c.date),
					pct: ((c.close - openRate) / openRate) * 100,
					close: c.close
				}))
			});
		}

		if (strips.length === 0) return;

		const innerWidth = width - MARGINS.left - MARGINS.right;
		const totalHeight = strips.length * BAND_HEIGHT + MARGINS.top + MARGINS.bottom;

		const allDates = strips.flatMap((s) => s.data.map((d) => d.date));
		const xScale = d3.scaleTime()
			.domain(d3.extent(allDates) as [Date, Date])
			.range([0, innerWidth]);

		const allPcts = strips.flatMap((s) => s.data.map((d) => Math.abs(d.pct)));
		const maxAbs = d3.max(allPcts) ?? 10;
		const bandStep = maxAbs / BANDS;

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3.select(containerEl).append('svg').attr('width', width).attr('height', totalHeight);
		} else {
			svg.attr('width', width).attr('height', totalHeight);
		}
		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', `translate(${MARGINS.left},${MARGINS.top})`);

		const posColors = ['rgba(20,184,166,0.3)', 'rgba(20,184,166,0.55)', 'rgba(20,184,166,0.85)'];
		const negColors = ['rgba(239,68,68,0.3)', 'rgba(239,68,68,0.55)', 'rgba(239,68,68,0.85)'];

		const defs = svg.append('defs');

		strips.forEach((strip, si) => {
			const y0 = si * BAND_HEIGHT;
			const clipId = `horizon-clip-${si}`;

			defs.append('clipPath')
				.attr('id', clipId)
				.append('rect')
				.attr('width', innerWidth)
				.attr('height', BAND_HEIGHT);

			const stripG = g.append('g')
				.attr('transform', `translate(0,${y0})`)
				.attr('clip-path', `url(#${clipId})`);

			stripG.append('rect')
				.attr('width', innerWidth).attr('height', BAND_HEIGHT)
				.attr('fill', COLORS.surface);

			stripG.append('line')
				.attr('x1', 0).attr('x2', innerWidth)
				.attr('y1', BAND_HEIGHT).attr('y2', BAND_HEIGHT)
				.attr('stroke', COLORS.border).attr('stroke-width', 0.5);

			g.append('text')
				.attr('x', -8)
				.attr('y', y0 + BAND_HEIGHT / 2)
				.attr('dy', '0.35em')
				.attr('text-anchor', 'end')
				.attr('fill', COLORS.textSecondary)
				.attr('font-size', 10)
				.text(strip.symbol);

			for (let band = 0; band < BANDS; band++) {
				const lo = band * bandStep;
				const bandYScale = d3.scaleLinear().domain([0, bandStep]).range([BAND_HEIGHT, 0]);

				const posArea = d3.area<(typeof strip.data)[number]>()
					.x((d) => xScale(d.date))
					.y0(BAND_HEIGHT)
					.y1((d) => {
						const v = d.pct;
						if (v <= lo) return BAND_HEIGHT;
						const clamped = Math.min(v - lo, bandStep);
						return bandYScale(clamped);
					})
					.curve(d3.curveMonotoneX);

				const negArea = d3.area<(typeof strip.data)[number]>()
					.x((d) => xScale(d.date))
					.y0(BAND_HEIGHT)
					.y1((d) => {
						const v = -d.pct;
						if (v <= lo) return BAND_HEIGHT;
						const clamped = Math.min(v - lo, bandStep);
						return bandYScale(clamped);
					})
					.curve(d3.curveMonotoneX);

				stripG.append('path')
					.datum(strip.data)
					.attr('fill', posColors[band])
					.attr('d', posArea);

				stripG.append('path')
					.datum(strip.data)
					.attr('fill', negColors[band])
					.attr('d', negArea);
			}

			stripG.append('rect')
				.attr('width', innerWidth).attr('height', BAND_HEIGHT)
				.attr('fill', 'none').attr('pointer-events', 'all')
				.on('mousemove', function (event) {
					const [mx] = d3.pointer(event);
					const x0 = xScale.invert(mx);
					const bisect = d3.bisector((d: (typeof strip.data)[number]) => d.date).left;
					const i = Math.min(bisect(strip.data, x0), strip.data.length - 1);
					const d = strip.data[i];
					tooltip = {
						show: true,
						x: event.clientX,
						y: event.clientY,
						symbol: strip.symbol,
						date: d3.timeFormat('%b %d, %Y')(d.date),
						pct: d.pct,
						price: d.close
					};
				})
				.on('mouseleave', () => {
					tooltip = { ...tooltip, show: false };
				});
		});

		const xAxis = d3.axisBottom(xScale).ticks(Math.min(8, allDates.length))
			.tickFormat((d) => d3.timeFormat('%b %d')(d as Date));
		g.append('g')
			.attr('transform', `translate(0,${strips.length * BAND_HEIGHT})`)
			.call(xAxis)
			.selectAll('text').attr('fill', COLORS.textSecondary).attr('font-size', 10);
		g.selectAll('.domain, .tick line').attr('stroke', COLORS.border);
	});
</script>

<div class="relative">
	<div bind:this={containerEl} style="height: {chartHeight}px"></div>
	{#if tooltip.show}
		<div
			class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 text-text-secondary">{tooltip.date}</div>
			<div class="mt-0.5 {tooltip.pct >= 0 ? 'text-gain' : 'text-loss'}">
				{tooltip.pct >= 0 ? '+' : ''}{pctFmt.format(tooltip.pct)}%
			</div>
			<div class="mt-0.5 text-text-secondary">{currFmt.format(tooltip.price)}</div>
		</div>
	{/if}
</div>
