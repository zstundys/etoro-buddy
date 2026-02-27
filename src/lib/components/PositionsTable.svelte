<script lang="ts">
	import type { EnrichedPosition } from '$lib/etoro';
	import { currency as fmt, percent as pctFmt, shortDate as dateFmt, monthYear as monthFmt, pnlColor, pnlSign, normalizeSymbol } from '$lib/format';

	let { positions }: { positions: EnrichedPosition[] } = $props();

	function monthKey(dateStr: string): string {
		const d = new Date(dateStr);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function monthLabel(key: string): string {
		const [y, m] = key.split('-');
		return monthFmt.format(new Date(Number(y), Number(m) - 1));
	}

	type MonthGroup = { key: string; positions: EnrichedPosition[]; totalAmount: number; totalPnl: number };
	type SymbolGroup = {
		symbol: string;
		displayName?: string;
		logoUrl?: string;
		months: MonthGroup[];
		totalAmount: number;
		totalPnl: number;
		positionCount: number;
	};

	function groupPositions(items: EnrichedPosition[]): SymbolGroup[] {
		const bySymbol = new Map<string, EnrichedPosition[]>();
		for (const pos of items) {
			const raw = pos.symbol ?? `#${pos.instrumentId}`;
			const key = normalizeSymbol(raw);
			if (!bySymbol.has(key)) bySymbol.set(key, []);
			bySymbol.get(key)!.push(pos);
		}

		const groups: SymbolGroup[] = [];
		for (const [symbol, symbolPositions] of bySymbol) {
			const byMonth = new Map<string, EnrichedPosition[]>();
			for (const pos of symbolPositions) {
				const mk = monthKey(pos.openDateTime);
				if (!byMonth.has(mk)) byMonth.set(mk, []);
				byMonth.get(mk)!.push(pos);
			}

			const months: MonthGroup[] = [...byMonth.entries()]
				.sort(([a], [b]) => b.localeCompare(a))
				.map(([key, pos]) => ({
					key,
					positions: pos,
					totalAmount: pos.reduce((s, p) => s + p.amount, 0),
					totalPnl: pos.reduce((s, p) => s + (p.pnl ?? 0), 0)
				}));

			groups.push({
				symbol,
				displayName: symbolPositions[0]?.displayName,
				logoUrl: symbolPositions.find((p) => p.logoUrl)?.logoUrl,
				months,
				totalAmount: symbolPositions.reduce((s, p) => s + p.amount, 0),
				totalPnl: symbolPositions.reduce((s, p) => s + (p.pnl ?? 0), 0),
				positionCount: symbolPositions.length
			});
		}

		return groups.sort((a, b) => b.totalAmount - a.totalAmount);
	}

	const grouped = $derived(groupPositions(positions));

	let expandedSymbols = $state<Set<string>>(new Set());
	let expandedMonths = $state<Set<string>>(new Set());

	function toggleSymbol(symbol: string) {
		const next = new Set(expandedSymbols);
		if (next.has(symbol)) next.delete(symbol);
		else next.add(symbol);
		expandedSymbols = next;
	}

	function toggleMonth(symbol: string, mk: string) {
		const key = `${symbol}::${mk}`;
		const next = new Set(expandedMonths);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		expandedMonths = next;
	}

	function expandAll() {
		const symbols = new Set<string>();
		const months = new Set<string>();
		for (const g of grouped) {
			symbols.add(g.symbol);
			for (const m of g.months) months.add(`${g.symbol}::${m.key}`);
		}
		expandedSymbols = symbols;
		expandedMonths = months;
	}

	function collapseAll() {
		expandedSymbols = new Set();
		expandedMonths = new Set();
	}
</script>

{#if positions.length === 0}
	<div class="rounded-xl border border-border bg-surface-raised px-8 py-16 text-center">
		<p class="text-lg text-text-secondary">No open positions</p>
	</div>
{:else}
	<div class="mb-3 flex items-center justify-between">
		<p class="text-sm text-text-secondary">
			{positions.length} position{positions.length !== 1 ? 's' : ''} across {grouped.length} asset{grouped.length !== 1 ? 's' : ''}
		</p>
		<div class="flex gap-2">
			<button onclick={expandAll} class="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary">
				Expand all
			</button>
			<button onclick={collapseAll} class="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary">
				Collapse all
			</button>
		</div>
	</div>

	<div class="space-y-2">
		{#each grouped as group (group.symbol)}
			{@const symbolExpanded = expandedSymbols.has(group.symbol)}
			<div class="overflow-hidden rounded-xl border border-border bg-surface-raised">
				<button
					onclick={() => toggleSymbol(group.symbol)}
					class="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-overlay/50"
				>
					<svg class="h-4 w-4 shrink-0 text-text-secondary transition-transform {symbolExpanded ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					{#if group.logoUrl}
						<img src={group.logoUrl} alt={group.symbol} class="h-7 w-7 shrink-0 rounded-full" />
					{:else}
						<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[10px] font-bold text-text-secondary">
							{group.symbol.slice(0, 2)}
						</div>
					{/if}
					<div class="flex min-w-0 flex-1 items-center gap-3">
						<div class="min-w-0">
							<span class="text-sm font-semibold">{group.symbol}</span>
							{#if group.displayName}
								<span class="ml-2 text-xs text-text-secondary">{group.displayName}</span>
							{/if}
						</div>
						<span class="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary">
							{group.positionCount}
						</span>
					</div>
					<div class="flex items-center gap-6 text-sm">
						<div class="text-right">
							<p class="text-xs text-text-secondary">Invested</p>
							<p class="font-medium">{fmt.format(group.totalAmount)}</p>
						</div>
						<div class="text-right">
							<p class="text-xs text-text-secondary">P&L</p>
							<p class="font-medium {pnlColor(group.totalPnl)}">
								{pnlSign(group.totalPnl)}{fmt.format(group.totalPnl)}
							</p>
						</div>
					</div>
				</button>

				{#if symbolExpanded}
					<div class="border-t border-border">
						{#each group.months as month (month.key)}
							{@const monthExpanded = expandedMonths.has(`${group.symbol}::${month.key}`)}
							<div class="border-b border-border/50 last:border-b-0">
								<button
									onclick={() => toggleMonth(group.symbol, month.key)}
									class="flex w-full items-center gap-3 px-5 py-2.5 pl-10 text-left transition-colors hover:bg-surface-overlay/30"
								>
									<svg class="h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform {monthExpanded ? 'rotate-90' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
									<span class="flex-1 text-xs font-medium text-text-secondary">{monthLabel(month.key)}</span>
									<span class="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary">
										{month.positions.length}
									</span>
									<div class="flex items-center gap-6 text-xs">
										<span>{fmt.format(month.totalAmount)}</span>
										<span class="{pnlColor(month.totalPnl)} w-20 text-right">
											{pnlSign(month.totalPnl)}{fmt.format(month.totalPnl)}
										</span>
									</div>
								</button>

								{#if monthExpanded}
									<div class="overflow-x-auto">
										<table class="w-full text-xs">
											<thead>
												<tr class="border-b border-border/30 text-left text-[10px] font-medium uppercase tracking-wider text-text-secondary">
													<th class="py-2 pl-16 pr-3">Date</th>
													<th class="px-3 py-2">Side</th>
													<th class="px-3 py-2 text-right">Amount</th>
													<th class="px-3 py-2 text-right">Units</th>
													<th class="px-3 py-2 text-right">Open Price</th>
													<th class="px-3 py-2 text-right">Current</th>
													<th class="px-3 py-2 text-right">P&L</th>
													<th class="px-3 py-2 pr-5 text-right">P&L %</th>
												</tr>
											</thead>
											<tbody class="divide-y divide-border/20">
												{#each month.positions as pos, i (pos.positionId || i)}
													<tr class="transition-colors hover:bg-surface-overlay/20">
														<td class="py-2 pl-16 pr-3 text-text-secondary">
															{dateFmt.format(new Date(pos.openDateTime))}
														</td>
														<td class="px-3 py-2">
															<span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium {pos.isBuy ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'}">
																{pos.isBuy ? 'BUY' : 'SELL'}
															</span>
														</td>
														<td class="px-3 py-2 text-right font-medium">{fmt.format(pos.amount)}</td>
														<td class="px-3 py-2 text-right tabular-nums text-text-secondary">{pos.units.toFixed(4)}</td>
														<td class="px-3 py-2 text-right tabular-nums">{fmt.format(pos.openRate)}</td>
														<td class="px-3 py-2 text-right tabular-nums">
															{pos.currentRate !== undefined ? fmt.format(pos.currentRate) : '—'}
														</td>
														<td class="px-3 py-2 text-right tabular-nums font-medium {pnlColor(pos.pnl)}">
															{pos.pnl !== undefined ? `${pnlSign(pos.pnl)}${fmt.format(pos.pnl)}` : '—'}
														</td>
														<td class="px-3 py-2 pr-5 text-right tabular-nums {pnlColor(pos.pnlPercent)}">
															{pos.pnlPercent !== undefined ? `${pnlSign(pos.pnlPercent)}${pctFmt.format(pos.pnlPercent)}%` : '—'}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
