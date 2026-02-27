<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition } from '$lib/etoro-api';
	import { COLORS, pnlColorScale, groupBySymbol, type SymbolSummary } from '$lib/chart-utils';
	import { currency as fmt, percent as pctFmt } from '$lib/format';

	type TreeNode = { symbol: string; totalAmount: number; totalPnl: number; avgPnlPct: number; count: number };
	type RectNode = d3.HierarchyRectangularNode<TreeNode>;

	let { positions }: { positions: EnrichedPosition[] } = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let tooltip = $state<{
		show: boolean;
		x: number;
		y: number;
		symbol: string;
		amount: number;
		pnl: number;
		pnlPercent: number;
		count: number;
	}>({ show: false, x: 0, y: 0, symbol: '', amount: 0, pnl: 0, pnlPercent: 0, count: 0 });

	const HEIGHT = 350;
	const MIN_LABEL_W = 44;
	const MIN_LABEL_H = 22;
	const MIN_AMOUNT_H = 36;

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((entries) => {
			const e = entries[0];
			if (e) width = e.contentRect.width;
		});
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!containerEl || width <= 0 || positions.length === 0) return;

		const groups = groupBySymbol(positions);
		const children: TreeNode[] = groups.map((g) => ({
			symbol: g.symbol,
			totalAmount: g.totalAmount,
			totalPnl: g.totalPnl,
			avgPnlPct: g.avgPnlPct,
			count: g.positions.length
		}));

		const root = d3
			.hierarchy<{ children: TreeNode[] }>({ children })
			.sum((d) => (d as unknown as TreeNode).totalAmount ?? 0);

		d3.treemap<{ children: TreeNode[] }>()
			.tile(d3.treemapSquarify)
			.size([width, HEIGHT])
			.paddingInner(2)
			.round(true)(root);

		const nodes = (root.leaves() as unknown as RectNode[]);

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3.select(containerEl).append('svg');
		}
		svg.attr('width', width).attr('height', HEIGHT);
		svg.selectAll('*').remove();

		const tile = svg
			.selectAll<SVGGElement, RectNode>('g.tile')
			.data(nodes, (d) => d.data.symbol)
			.join('g')
			.attr('class', 'tile')
			.attr('transform', (d) => `translate(${d.x0},${d.y0})`);

		tile
			.append('rect')
			.attr('width', (d) => Math.max(0, d.x1 - d.x0))
			.attr('height', (d) => Math.max(0, d.y1 - d.y0))
			.attr('rx', 3)
			.attr('fill', (d) => pnlColorScale(d.data.avgPnlPct))
			.style('cursor', 'pointer');

		tile
			.append('text')
			.attr('x', 5)
			.attr('y', 15)
			.attr('fill', COLORS.textPrimary)
			.attr('font-size', 11)
			.attr('font-weight', 600)
			.style('pointer-events', 'none')
			.text((d) => {
				const w = d.x1 - d.x0;
				const h = d.y1 - d.y0;
				return w >= MIN_LABEL_W && h >= MIN_LABEL_H ? d.data.symbol : '';
			});

		tile
			.append('text')
			.attr('x', 5)
			.attr('y', 28)
			.attr('fill', COLORS.textSecondary)
			.attr('font-size', 10)
			.style('pointer-events', 'none')
			.text((d) => {
				const w = d.x1 - d.x0;
				const h = d.y1 - d.y0;
				return w >= MIN_LABEL_W && h >= MIN_AMOUNT_H ? fmt.format(d.data.totalAmount) : '';
			});

		tile
			.on('mouseenter', function (event, d) {
				tooltip = {
					show: true,
					x: event.clientX,
					y: event.clientY,
					symbol: d.data.symbol,
					amount: d.data.totalAmount,
					pnl: d.data.totalPnl,
					pnlPercent: d.data.avgPnlPct,
					count: d.data.count
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

<div class="relative" bind:this={containerEl} style="height: {HEIGHT}px">
	{#if tooltip.show}
		<div
			class="pointer-events-none fixed rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-xl"
			style="left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			<div class="mt-1 text-text-secondary">{tooltip.count} position{tooltip.count !== 1 ? 's' : ''}</div>
			<div class="mt-0.5 text-text-secondary">Invested: {fmt.format(tooltip.amount)}</div>
			<div class="mt-0.5 {tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
				P&L: {tooltip.pnl >= 0 ? '+' : ''}{fmt.format(tooltip.pnl)}
				({tooltip.pnlPercent >= 0 ? '+' : ''}{pctFmt.format(tooltip.pnlPercent)}%)
			</div>
		</div>
	{/if}
</div>
