<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition } from '$lib/etoro-api';
	import { COLORS, pnlColorScale, groupBySymbol, buildLogoColorMap, categoryColors } from '$lib/chart-utils';
	import { currency as fmt, normalizeSymbol, percent as pctFmt, shortDate as dateFmt } from '$lib/format';

	interface RootNode { name: string; children?: NodeData[] }
	interface SymbolNode {
		name: string; logoUrl?: string; totalAmount: number;
		totalPnl: number; avgPnlPct: number; children?: NodeData[];
	}
	interface PosNode {
		name: string; amount: number; pnl?: number; pnlPercent?: number;
		openDateTime: string; positionId: number;
	}
	type NodeData = RootNode | SymbolNode | PosNode;
	type ArcNode = d3.HierarchyRectangularNode<NodeData>;

	let { positions }: { positions: EnrichedPosition[] } = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let logoColors = $state<Map<string, string>>(new Map());
	let focusedSymbol = $state<string | null>(null);

	let tooltip = $state<{
		show: boolean; x: number; y: number;
		symbol: string; amount: number; pnl: number | undefined;
		pnlPercent: number | undefined; date?: string; count?: number;
	}>({ show: false, x: 0, y: 0, symbol: '', amount: 0, pnl: undefined, pnlPercent: undefined });

	const SIZE = 420;
	const INNER_R = 0.28;

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((e) => { if (e[0]) width = e[0].contentRect.width; });
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (positions.length === 0) return;
		buildLogoColorMap(positions).then((m) => { logoColors = m; });
	});

	function arcColor(d: ArcNode): string {
		const data = d.data;
		if ('totalAmount' in data) {
			const lc = logoColors.get(data.name);
			if (lc) return lc;
			return categoryColors(data.name);
		}
		if ('pnlPercent' in data) return pnlColorScale(data.pnlPercent ?? 0);
		return COLORS.surfaceOverlay;
	}

	function midAngle(d: ArcNode): number {
		return (d.x0 + d.x1) / 2;
	}

	$effect(() => {
		if (!containerEl || width <= 0 || positions.length === 0) return;
		// touch reactive deps
		const _lc = logoColors;
		const _focus = focusedSymbol;

		const size = Math.min(width, SIZE);
		const radius = size / 2;
		const innerR = radius * INNER_R;

		const groups = groupBySymbol(positions);
		const rootData: RootNode = {
			name: 'root',
			children: groups.map((g) => ({
				name: g.symbol,
				logoUrl: g.logoUrl,
				totalAmount: g.totalAmount,
				totalPnl: g.totalPnl,
				avgPnlPct: g.avgPnlPct,
				children: g.positions.map((p) => ({
					name: normalizeSymbol(p.symbol ?? `#${p.instrumentId}`),
					amount: p.amount,
					pnl: p.pnl,
					pnlPercent: p.pnlPercent,
					openDateTime: p.openDateTime,
					positionId: p.positionId
				}))
			} as SymbolNode))
		};

		const root = d3
			.hierarchy<NodeData>(rootData)
			.sum((d) => {
				if ('amount' in d) return (d as PosNode).amount;
				return 0;
			})
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

		d3.partition<NodeData>()
			.size([2 * Math.PI, radius - innerR])
			.padding(0.005)(root);

		const allNodes = (root.descendants() as ArcNode[]).filter((d) => d.depth > 0);

		const arc = d3.arc<ArcNode>()
			.startAngle((d) => d.x0)
			.endAngle((d) => d.x1)
			.innerRadius((d) => innerR + d.y0)
			.outerRadius((d) => innerR + d.y1)
			.padAngle(0.005)
			.padRadius(innerR);

		let svg = d3.select(containerEl).select<SVGSVGElement>('svg');
		if (svg.empty()) {
			svg = d3.select(containerEl).append('svg');
		}
		svg
			.attr('width', size)
			.attr('height', size)
			.attr('viewBox', `${-radius} ${-radius} ${size} ${size}`)
			.style('overflow', 'visible');

		svg.selectAll('*').remove();
		const g = svg.append('g');

		// Arcs
		g.selectAll<SVGPathElement, ArcNode>('path.arc')
			.data(allNodes, (d) => {
				if ('positionId' in d.data) return `p-${(d.data as PosNode).positionId}`;
				return `s-${d.data.name}`;
			})
			.join('path')
			.attr('class', 'arc')
			.attr('d', (d) => arc(d) ?? '')
			.attr('fill', (d) => arcColor(d))
			.attr('opacity', (d) => {
				if (!_focus) return 0.9;
				const sym = d.depth === 1 ? d.data.name : d.parent?.data.name;
				return sym === _focus ? 1 : 0.2;
			})
			.attr('stroke', COLORS.surface)
			.attr('stroke-width', 0.5)
			.style('cursor', 'pointer')
			.on('mouseenter', function (event, d) {
				const data = d.data;
				if ('totalAmount' in data) {
					const sd = data as SymbolNode;
					tooltip = {
						show: true,
						x: event.clientX,
						y: event.clientY,
						symbol: sd.name,
						amount: sd.totalAmount,
						pnl: sd.totalPnl,
						pnlPercent: sd.avgPnlPct,
						count: d.children?.length
					};
				} else if ('amount' in data) {
					const pd = data as PosNode;
					tooltip = {
						show: true,
						x: event.clientX,
						y: event.clientY,
						symbol: pd.name,
						amount: pd.amount,
						pnl: pd.pnl,
						pnlPercent: pd.pnlPercent,
						date: pd.openDateTime ? dateFmt.format(new Date(pd.openDateTime)) : undefined
					};
				}
			})
			.on('mousemove', function (event) {
				tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
			})
			.on('mouseleave', () => { tooltip = { ...tooltip, show: false }; })
			.on('click', function (_event, d) {
				if (d.depth === 1) {
					focusedSymbol = focusedSymbol === d.data.name ? null : d.data.name;
				}
			});

		// Inner ring labels (symbol names)
		const innerNodes = allNodes.filter((d) => d.depth === 1);
		g.selectAll<SVGTextElement, ArcNode>('text.arc-label')
			.data(innerNodes, (d) => d.data.name)
			.join('text')
			.attr('class', 'arc-label')
			.attr('transform', (d) => {
				const mid = midAngle(d);
				const r = innerR + (d.y0 + d.y1) / 2;
				const x = Math.sin(mid) * r;
				const y = -Math.cos(mid) * r;
				const rot = (mid * 180 / Math.PI) - 90;
				const flip = mid > Math.PI;
				return `translate(${x},${y}) rotate(${flip ? rot + 180 : rot})`;
			})
			.attr('text-anchor', 'middle')
			.attr('dominant-baseline', 'central')
			.attr('fill', COLORS.textPrimary)
			.attr('font-size', (d) => {
				const span = d.x1 - d.x0;
				return span > 0.3 ? 10 : span > 0.15 ? 9 : 0;
			})
			.attr('font-weight', 500)
			.style('pointer-events', 'none')
			.text((d) => {
				const span = d.x1 - d.x0;
				return span > 0.15 ? d.data.name : '';
			});

		// Center label
		const totalInvested = positions.reduce((s, p) => s + p.amount, 0);
		const centerG = g.append('g').attr('class', 'center');

		centerG.append('circle')
			.attr('r', innerR)
			.attr('fill', 'transparent')
			.style('cursor', focusedSymbol ? 'pointer' : 'default')
			.on('click', () => { focusedSymbol = null; });

		if (focusedSymbol) {
			const group = groups.find((gr) => gr.symbol === focusedSymbol);
			centerG.append('text')
				.attr('text-anchor', 'middle')
				.attr('dy', '-0.3em')
				.attr('fill', COLORS.textPrimary)
				.attr('font-size', 13)
				.attr('font-weight', 600)
				.text(focusedSymbol);
			if (group) {
				centerG.append('text')
					.attr('text-anchor', 'middle')
					.attr('dy', '1em')
					.attr('fill', COLORS.textSecondary)
					.attr('font-size', 11)
					.text(fmt.format(group.totalAmount));
			}
		} else {
			centerG.append('text')
				.attr('text-anchor', 'middle')
				.attr('dy', '-0.3em')
				.attr('fill', COLORS.textSecondary)
				.attr('font-size', 11)
				.text('Total');
			centerG.append('text')
				.attr('text-anchor', 'middle')
				.attr('dy', '1em')
				.attr('fill', COLORS.textPrimary)
				.attr('font-size', 13)
				.attr('font-weight', 600)
				.text(fmt.format(totalInvested));
		}
	});
</script>

<div class="relative flex justify-center" bind:this={containerEl} style="min-height: {SIZE}px">
	{#if tooltip.show}
		<div
			class="pointer-events-none fixed rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-xl"
			style="left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
		>
			<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
			{#if tooltip.count}
				<div class="mt-0.5 text-text-secondary">{tooltip.count} position{tooltip.count !== 1 ? 's' : ''}</div>
			{/if}
			{#if tooltip.date}
				<div class="mt-0.5 text-text-secondary">{tooltip.date}</div>
			{/if}
			<div class="mt-0.5 text-text-secondary">Invested: {fmt.format(tooltip.amount)}</div>
			{#if tooltip.pnl !== undefined}
				<div class="mt-0.5 {tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
					P&L: {tooltip.pnl >= 0 ? '+' : ''}{fmt.format(tooltip.pnl)}
					{#if tooltip.pnlPercent !== undefined}
						({tooltip.pnlPercent >= 0 ? '+' : ''}{pctFmt.format(tooltip.pnlPercent)}%)
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
