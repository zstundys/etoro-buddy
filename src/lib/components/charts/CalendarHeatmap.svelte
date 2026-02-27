<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition, EnrichedTrade } from '$lib/etoro';
	import { COLORS } from '$lib/chart-utils';
	import { currency as fmt, shortDate } from '$lib/format';

	let { positions, trades }: { positions: EnrichedPosition[]; trades: EnrichedTrade[] } = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		date: string;
		events: number;
		capital: number;
	}>({
		show: false,
		x: 0,
		y: 0,
		date: '',
		events: 0,
		capital: 0
	});

	const CELL_SIZE = 14;
	const GAP = 2;
	const CELL_TOTAL = CELL_SIZE + GAP;
	const ROWS = 7; // Mon–Sun
	const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];
	const LABEL_WIDTH = 16;
	const MONTH_LABEL_HEIGHT = 14;

	const height = ROWS * CELL_TOTAL + MONTH_LABEL_HEIGHT;

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

		// Build daily aggregates: positions opened + trades closed
		const byDate = new Map<string, { events: number; capital: number }>();

		for (const p of positions) {
			if (!p.openDateTime) continue;
			const d = new Date(p.openDateTime);
			if (isNaN(d.getTime())) continue;
			const key = d.toISOString().slice(0, 10);
			const curr = byDate.get(key) ?? { events: 0, capital: 0 };
			curr.events += 1;
			curr.capital += p.amount ?? 0;
			byDate.set(key, curr);
		}

		for (const t of trades) {
			if (!t.closeTimestamp) continue;
			const d = new Date(t.closeTimestamp);
			if (isNaN(d.getTime())) continue;
			const key = d.toISOString().slice(0, 10);
			const curr = byDate.get(key) ?? { events: 0, capital: 0 };
			curr.events += 1;
			curr.capital += t.investment ?? 0;
			byDate.set(key, curr);
		}

		const dates = [...byDate.keys()].map((k) => new Date(k));
		if (dates.length === 0) {
			// No data: show empty grid for last 12 weeks
			const end = new Date();
			const start = d3.timeDay.offset(end, -12 * 7);
			dates.push(start, end);
		}

		const minDate = d3.min(dates)!;
		const maxDate = d3.max(dates)!;

		// Align to Monday
		const getMonday = (d: Date) => {
			const day = d.getDay();
			const diff = day === 0 ? -6 : 1 - day;
			return d3.timeDay.offset(d, diff);
		};

		const startMonday = getMonday(minDate);
		const endSunday = d3.timeDay.offset(getMonday(maxDate), 6);
		const totalDays = Math.ceil((endSunday.getTime() - startMonday.getTime()) / 86400000) + 1;
		const numWeeks = Math.ceil(totalDays / 7);

		const maxEvents = d3.max([...byDate.values()], (v) => v.events) ?? 1;
		const colorScale = d3.scaleSequential(d3.interpolateGreens).domain([0, Math.max(maxEvents, 1)]);

		const chartWidth = numWeeks * CELL_TOTAL + GAP;
		const totalWidth = LABEL_WIDTH + chartWidth;
		const offsetX = Math.max(0, (width - totalWidth) / 2);

		// Month labels: unique months in range
		const months = d3.timeMonth.range(startMonday, d3.timeDay.offset(endSunday, 1));
		const monthPositions = months.map((m) => {
			const firstDay = getMonday(m);
			const weekIdx = Math.floor((firstDay.getTime() - startMonday.getTime()) / (7 * 86400000));
			return { month: m, x: LABEL_WIDTH + weekIdx * CELL_TOTAL };
		});

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

		const g = svg.append('g').attr('transform', `translate(${offsetX}, 0)`);

		// Day-of-week labels (M, W, F)
		g.selectAll('text.day-label')
			.data(DAY_LABELS)
			.join('text')
			.attr('class', 'day-label')
			.attr('x', LABEL_WIDTH - 4)
			.attr('y', (_, i) => MONTH_LABEL_HEIGHT + i * CELL_TOTAL + CELL_SIZE / 2 + 4)
			.attr('text-anchor', 'end')
			.attr('fill', COLORS.textSecondary)
			.attr('font-size', 10)
			.text((d) => d)
			.filter((d) => d === '')
			.text('');

		// Month labels
		g.selectAll('text.month-label')
			.data(monthPositions)
			.join('text')
			.attr('class', 'month-label')
			.attr('x', (d) => d.x + CELL_TOTAL / 2)
			.attr('y', 10)
			.attr('text-anchor', 'start')
			.attr('fill', COLORS.textSecondary)
			.attr('font-size', 10)
			.text((d) => d3.timeFormat('%b')(d.month));

		// Cells
		const cells: { date: Date; key: string; events: number; capital: number; x: number; y: number }[] = [];

		for (let w = 0; w < numWeeks; w++) {
			for (let d = 0; d < 7; d++) {
				const date = d3.timeDay.offset(startMonday, w * 7 + d);
				const key = date.toISOString().slice(0, 10);
				const agg = byDate.get(key) ?? { events: 0, capital: 0 };
				const x = LABEL_WIDTH + w * CELL_TOTAL + GAP;
				const y = MONTH_LABEL_HEIGHT + d * CELL_TOTAL + GAP;
				cells.push({
					date,
					key,
					events: agg.events,
					capital: agg.capital,
					x,
					y
				});
			}
		}

		const cellGroup = g.append('g').attr('class', 'cells');

		cellGroup
			.selectAll('rect')
			.data(cells)
			.join('rect')
			.attr('x', (d) => d.x)
			.attr('y', (d) => d.y)
			.attr('width', CELL_SIZE)
			.attr('height', CELL_SIZE)
			.attr('rx', 2)
			.attr('fill', (d) => (d.events > 0 ? colorScale(d.events) : COLORS.surfaceOverlay))
			.attr('cursor', 'pointer')
			.on('mouseenter', function (event, d) {
				tooltip = {
					show: true,
					x: event.clientX,
					y: event.clientY,
					date: shortDate.format(d.date),
					events: d.events,
					capital: d.capital
				};
			})
			.on('mousemove', function (event) {
				tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
			})
			.on('mouseleave', () => {
				tooltip = { ...tooltip, show: false };
			});
	});
</script>

<div bind:this={containerEl} class="relative w-full" style="min-height: {height}px">
	{#if tooltip.show}
		<div
			class="fixed z-50 bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
			style="left: {tooltip.x + 10}px; top: {tooltip.y + 10}px"
		>
			<div class="font-medium text-text-primary">{tooltip.date}</div>
			<div class="text-text-secondary">
				{tooltip.events} {tooltip.events === 1 ? 'event' : 'events'}
			</div>
			<div class="text-text-secondary">{fmt.format(tooltip.capital)}</div>
		</div>
	{/if}
</div>
