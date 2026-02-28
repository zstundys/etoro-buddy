<script lang="ts">
	import * as d3 from 'd3';
	import type { EnrichedPosition } from '$lib/etoro-api';
	import { COLORS, pnlColorScale, groupBySymbol, symbolColor } from '$lib/chart-utils';
	import { currency as fmt, normalizeSymbol, percent as pctFmt, shortDate as dateFmt } from '$lib/format';

	interface RootNode { name: string; children?: NodeData[] }
	interface SectorNode {
		name: string; isSector: true; totalAmount: number;
		totalPnl: number; avgPnlPct: number; symbolCount: number; children?: NodeData[];
	}
	interface SymbolNode {
		name: string; logoUrl?: string; totalAmount: number;
		totalPnl: number; avgPnlPct: number; children?: NodeData[];
	}
	interface PosNode {
		name: string; amount: number; pnl?: number; pnlPercent?: number;
		openDateTime: string; positionId: number;
	}
	type NodeData = RootNode | SectorNode | SymbolNode | PosNode;
	type ArcNode = d3.HierarchyRectangularNode<NodeData>;

	let { positions, colorMap = new Map(), sectorMap = new Map() }: {
		positions: EnrichedPosition[];
		colorMap?: Map<string, string>;
		sectorMap?: Map<number, string>;
	} = $props();

	type Mode = 'symbol' | 'sector';
	let mode = $state<Mode>('symbol');
	let containerEl: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let focusedName = $state<string | null>(null);

	let tooltip = $state<{
		show: boolean; x: number; y: number;
		symbol: string; amount: number; pnl: number | undefined;
		pnlPercent: number | undefined; date?: string; count?: number;
		label?: string;
	}>({ show: false, x: 0, y: 0, symbol: '', amount: 0, pnl: undefined, pnlPercent: undefined });

	const SIZE = 420;
	const INNER_R = 0.28;
	const hasSectors = $derived(sectorMap.size > 0);

	const sectorColorScale = d3.scaleOrdinal(d3.schemeTableau10);

	function setMode(m: Mode) {
		mode = m;
		focusedName = null;
	}

	$effect(() => {
		if (!containerEl) return;
		const ro = new ResizeObserver((e) => { if (e[0]) width = e[0].contentRect.width; });
		ro.observe(containerEl);
		return () => ro.disconnect();
	});

	function isSectorNode(d: NodeData): d is SectorNode {
		return 'isSector' in d;
	}

	function arcColor(d: ArcNode): string {
		const data = d.data;
		if (isSectorNode(data)) return sectorColorScale(data.name);
		if ('totalAmount' in data) return symbolColor(data.name, colorMap);
		if ('pnlPercent' in data) return pnlColorScale(data.pnlPercent ?? 0);
		return COLORS.surfaceOverlay;
	}

	function buildSymbolChildren(positions: EnrichedPosition[]): PosNode[] {
		return positions.map((p) => ({
			name: normalizeSymbol(p.symbol ?? `#${p.instrumentId}`),
			amount: p.amount,
			pnl: p.pnl,
			pnlPercent: p.pnlPercent,
			openDateTime: p.openDateTime,
			positionId: p.positionId
		}));
	}

	$effect(() => {
		if (!containerEl || width <= 0 || positions.length === 0) return;
		const _cm = colorMap;
		const _mode = mode;
		const _focus = focusedName;
		const _sectorMap = sectorMap;

		const size = Math.min(width, SIZE);
		const radius = size / 2;
		const innerR = radius * INNER_R;

		const groups = groupBySymbol(positions);

		let rootData: RootNode;

		if (_mode === 'sector' && _sectorMap.size > 0) {
			const sectorGroups = new Map<string, typeof groups>();
			for (const g of groups) {
				const firstPos = g.positions[0];
				const sectorName = firstPos ? _sectorMap.get(firstPos.instrumentId) ?? 'Other' : 'Other';
				if (!sectorGroups.has(sectorName)) sectorGroups.set(sectorName, []);
				sectorGroups.get(sectorName)!.push(g);
			}

			rootData = {
				name: 'root',
				children: [...sectorGroups.entries()].map(([sectorName, syms]) => {
					const totalAmount = syms.reduce((s, g) => s + g.totalAmount, 0);
					const totalPnl = syms.reduce((s, g) => s + g.totalPnl, 0);
					return {
						name: sectorName,
						isSector: true as const,
						totalAmount,
						totalPnl,
						avgPnlPct: totalAmount > 0 ? (totalPnl / totalAmount) * 100 : 0,
						symbolCount: syms.length,
						children: syms.map((g) => ({
							name: g.symbol,
							logoUrl: g.logoUrl,
							totalAmount: g.totalAmount,
							totalPnl: g.totalPnl,
							avgPnlPct: g.avgPnlPct,
							children: buildSymbolChildren(g.positions)
						} as SymbolNode))
					} as SectorNode;
				})
			};
		} else {
			rootData = {
				name: 'root',
				children: groups.map((g) => ({
					name: g.symbol,
					logoUrl: g.logoUrl,
					totalAmount: g.totalAmount,
					totalPnl: g.totalPnl,
					avgPnlPct: g.avgPnlPct,
					children: buildSymbolChildren(g.positions)
				} as SymbolNode))
			};
		}

		const root = d3
			.hierarchy<NodeData>(rootData)
			.sum((d) => ('amount' in d ? (d as PosNode).amount : 0))
			.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

		d3.partition<NodeData>()
			.size([2 * Math.PI, radius - innerR])
			.padding(0.005)(root);

		const allNodes = (root.descendants() as ArcNode[]).filter((d) => d.depth > 0);

		let xScale = (v: number) => v;
		let yOffset = 0;
		let yScaleFactor = 1;
		const focusNode = _focus
			? allNodes.find((d) => d.data.name === _focus && d.children && d.children.length > 0)
			: null;

		if (focusNode) {
			const sx = d3.scaleLinear()
				.domain([focusNode.x0, focusNode.x1])
				.range([0, 2 * Math.PI]);
			xScale = (v: number) => sx(v);
			yOffset = focusNode.y0;
			const maxY = d3.max(allNodes.filter((d) => {
				let a: typeof d | null = d;
				while (a) { if (a === focusNode) return true; a = a.parent; }
				return false;
			}), (d) => d.y1) ?? focusNode.y1;
			const visibleExtent = maxY - yOffset;
			if (visibleExtent > 0) yScaleFactor = (radius - innerR) / visibleExtent;
		}

		const visibleNodes = focusNode
			? allNodes.filter((d) => {
				let ancestor: typeof d | null = d;
				while (ancestor) {
					if (ancestor === focusNode) return true;
					ancestor = ancestor.parent;
				}
				return false;
			})
			: allNodes;

		const arc = d3.arc<ArcNode>()
			.startAngle((d) => Math.max(0, Math.min(2 * Math.PI, xScale(d.x0))))
			.endAngle((d) => Math.max(0, Math.min(2 * Math.PI, xScale(d.x1))))
			.innerRadius((d) => innerR + (d.y0 - yOffset) * yScaleFactor)
			.outerRadius((d) => innerR + (d.y1 - yOffset) * yScaleFactor)
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

		g.selectAll<SVGPathElement, ArcNode>('path.arc')
			.data(visibleNodes, (d) => {
				if ('positionId' in d.data) return `p-${(d.data as PosNode).positionId}`;
				if (isSectorNode(d.data)) return `sec-${d.data.name}`;
				return `s-${d.data.name}`;
			})
			.join('path')
			.attr('class', 'arc')
			.attr('d', (d) => arc(d) ?? '')
			.attr('fill', (d) => arcColor(d))
			.attr('opacity', 0.9)
			.attr('stroke', COLORS.surface)
			.attr('stroke-width', 0.5)
			.style('cursor', 'pointer')
			.on('mouseenter', function (event, d) {
				const data = d.data;
				if (isSectorNode(data)) {
					tooltip = {
						show: true, x: event.clientX, y: event.clientY,
						symbol: data.name, amount: data.totalAmount,
						pnl: data.totalPnl, pnlPercent: data.avgPnlPct,
						count: data.symbolCount, label: 'Sector'
					};
				} else if ('totalAmount' in data) {
					const sd = data as SymbolNode;
					tooltip = {
						show: true, x: event.clientX, y: event.clientY,
						symbol: sd.name, amount: sd.totalAmount,
						pnl: sd.totalPnl, pnlPercent: sd.avgPnlPct,
						count: d.children?.length
					};
				} else if ('amount' in data) {
					const pd = data as PosNode;
					tooltip = {
						show: true, x: event.clientX, y: event.clientY,
						symbol: pd.name, amount: pd.amount,
						pnl: pd.pnl, pnlPercent: pd.pnlPercent,
						date: pd.openDateTime ? dateFmt.format(new Date(pd.openDateTime)) : undefined
					};
				}
			})
			.on('mousemove', function (event) {
				tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
			})
			.on('mouseleave', () => { tooltip = { ...tooltip, show: false }; })
			.on('click', function (_event, d) {
				const hasChildren = d.children && d.children.length > 0;
				if (hasChildren) {
					focusedName = focusedName === d.data.name ? null : d.data.name;
				} else if (!focusNode) {
					const parentName = d.parent?.data.name ?? null;
					if (parentName && parentName !== 'root') focusedName = parentName;
				}
			});

		// Arc labels — show on the "primary" ring (depth-1 when unfocused, first visible ring when focused)
		const labelDepth = focusNode ? focusNode.depth + 1 : 1;
		const labelNodes = visibleNodes.filter((d) => d.depth === labelDepth);

		g.selectAll<SVGTextElement, ArcNode>('text.arc-label')
			.data(labelNodes, (d) => `lbl-${d.data.name}`)
			.join('text')
			.attr('class', 'arc-label')
			.attr('transform', (d) => {
				const mid = (xScale(d.x0) + xScale(d.x1)) / 2;
				const r = innerR + ((d.y0 - yOffset) + (d.y1 - yOffset)) / 2 * yScaleFactor;
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
				const span = xScale(d.x1) - xScale(d.x0);
				return span > 0.3 ? 10 : span > 0.15 ? 9 : 0;
			})
			.attr('font-weight', 500)
			.style('pointer-events', 'none')
			.text((d) => {
				const span = xScale(d.x1) - xScale(d.x0);
				if (span < 0.15) return '';
				if ('amount' in d.data) return fmt.format((d.data as PosNode).amount);
				return d.data.name;
			});

		// When focused, also show labels on the next depth ring if present
		if (focusNode) {
			const secondDepth = focusNode.depth + 2;
			const secondNodes = visibleNodes.filter((d) => d.depth === secondDepth);
			g.selectAll<SVGTextElement, ArcNode>('text.sub-label')
				.data(secondNodes, (d) => `sl-${('positionId' in d.data ? (d.data as PosNode).positionId : d.data.name)}`)
				.join('text')
				.attr('class', 'sub-label')
				.attr('transform', (d) => {
					const mid = (xScale(d.x0) + xScale(d.x1)) / 2;
					const r = innerR + ((d.y0 - yOffset) + (d.y1 - yOffset)) / 2 * yScaleFactor;
					const x = Math.sin(mid) * r;
					const y = -Math.cos(mid) * r;
					const rot = (mid * 180 / Math.PI) - 90;
					const flip = mid > Math.PI;
					return `translate(${x},${y}) rotate(${flip ? rot + 180 : rot})`;
				})
				.attr('text-anchor', 'middle')
				.attr('dominant-baseline', 'central')
				.attr('fill', COLORS.textPrimary)
				.attr('font-size', 10)
				.style('pointer-events', 'none')
				.text((d) => {
					const span = xScale(d.x1) - xScale(d.x0);
					if (span < 0.2) return '';
					if ('amount' in d.data) return fmt.format((d.data as PosNode).amount);
					if ('totalAmount' in d.data) return fmt.format((d.data as SymbolNode).totalAmount);
					return d.data.name;
				});
		}

		// Center label
		const totalInvested = positions.reduce((s, p) => s + p.amount, 0);
		const centerG = g.append('g').attr('class', 'center');

		const parentOfFocus = focusNode?.parent;
		const canZoomOut = focusNode != null;

		centerG.append('circle')
			.attr('r', innerR)
			.attr('fill', 'transparent')
			.style('cursor', canZoomOut ? 'pointer' : 'default')
			.on('click', () => {
				if (!focusNode) return;
				const parentName = parentOfFocus?.data.name;
				focusedName = (parentName && parentName !== 'root') ? parentName : null;
			});

		if (focusNode) {
			const data = focusNode.data;
			const focusAmount = isSectorNode(data) ? data.totalAmount
				: ('totalAmount' in data ? (data as SymbolNode).totalAmount : 0);

			centerG.append('text')
				.attr('text-anchor', 'middle')
				.attr('dy', '-0.8em')
				.attr('fill', COLORS.textPrimary)
				.attr('font-size', 13)
				.attr('font-weight', 600)
				.text(focusNode.data.name);

			centerG.append('text')
				.attr('text-anchor', 'middle')
				.attr('dy', '0.4em')
				.attr('fill', COLORS.textSecondary)
				.attr('font-size', 11)
				.text(fmt.format(focusAmount));

			centerG.append('text')
				.attr('text-anchor', 'middle')
				.attr('dy', '1.7em')
				.attr('fill', COLORS.textSecondary)
				.attr('font-size', 9)
				.text('click center to zoom out');
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

<div class="flex flex-col items-center gap-3">
	{#if hasSectors}
		<div class="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
			<button
				type="button"
				class="rounded-md px-3 py-1 font-medium transition-colors {mode === 'symbol' ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}"
				onclick={() => setMode('symbol')}
			>
				By Symbol
			</button>
			<button
				type="button"
				class="rounded-md px-3 py-1 font-medium transition-colors {mode === 'sector' ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}"
				onclick={() => setMode('sector')}
			>
				By Sector
			</button>
		</div>
	{/if}

	<div class="relative flex w-full justify-center" bind:this={containerEl} style="min-height: {SIZE}px">
		{#if tooltip.show}
			<div
				class="pointer-events-none fixed rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-xl"
				style="left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
			>
				{#if tooltip.label}
					<div class="text-[10px] uppercase tracking-wider text-text-secondary">{tooltip.label}</div>
				{/if}
				<div class="font-semibold text-text-primary">{tooltip.symbol}</div>
				{#if tooltip.count}
					<div class="mt-0.5 text-text-secondary">
						{tooltip.count} {tooltip.label === 'Sector' ? 'symbol' : 'position'}{tooltip.count !== 1 ? 's' : ''}
					</div>
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
</div>
