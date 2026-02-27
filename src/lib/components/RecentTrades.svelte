<script lang="ts">
	import type { EnrichedTrade, EnrichedPosition } from '$lib/etoro-api';
	import { currency as fmt, percent as pctFmt, shortDate as dateFmt, pnlColor, pnlSign, normalizeSymbol } from '$lib/format';
	import DateRangeFilter from './DateRangeFilter.svelte';

	let { trades, positions }: { trades: EnrichedTrade[]; positions: EnrichedPosition[] } = $props();

	type UnifiedRow = {
		id: number;
		status: 'open' | 'closed';
		date: string;
		symbol: string;
		logoUrl?: string;
		isBuy: boolean;
		invested: number;
		openRate: number;
		closeRate?: number;
		currentRate?: number;
		fees: number;
		pnl: number | undefined;
		pnlPercent: number | undefined;
	};

	const allRows = $derived.by((): UnifiedRow[] => {
		const closedRows: UnifiedRow[] = trades.map((t) => ({
			id: t.positionId,
			status: 'closed' as const,
			date: t.closeTimestamp,
			symbol: t.symbol ? normalizeSymbol(t.symbol) : `#${t.instrumentId}`,
			logoUrl: t.logoUrl,
			isBuy: t.isBuy,
			invested: t.investment,
			openRate: t.openRate,
			closeRate: t.closeRate,
			fees: t.fees,
			pnl: t.netProfit,
			pnlPercent: t.investment > 0 ? (t.netProfit / t.investment) * 100 : 0
		}));

		const openRows: UnifiedRow[] = positions.map((p) => ({
			id: p.positionId,
			status: 'open' as const,
			date: p.openDateTime,
			symbol: p.symbol ? normalizeSymbol(p.symbol) : `#${p.instrumentId}`,
			logoUrl: p.logoUrl,
			isBuy: p.isBuy,
			invested: p.amount,
			openRate: p.openRate,
			currentRate: p.currentRate,
			fees: p.totalFees,
			pnl: p.pnl,
			pnlPercent: p.pnlPercent
		}));

		return [...closedRows, ...openRows].sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
		);
	});

	const dateRange = $derived.by(() => {
		let min = Infinity, max = -Infinity;
		for (const r of allRows) {
			const t = new Date(r.date).getTime();
			if (isNaN(t)) continue;
			if (t < min) min = t;
			if (t > max) max = t;
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		if (min > max) return { min: today, max: today };
		return { min: new Date(min), max: new Date(Math.max(max, today.getTime())) };
	});

	let filterStart = $state<Date | null>(null);
	let filterEnd = $state<Date | null>(null);

	const activeStart = $derived(filterStart ?? dateRange.min);
	const activeEnd = $derived(filterEnd ?? dateRange.max);

	function onFilterChange(start: Date, end: Date) {
		const sameAsMin = start.getTime() <= dateRange.min.getTime();
		const sameAsMax = end.getTime() >= dateRange.max.getTime();
		filterStart = sameAsMin ? null : start;
		filterEnd = sameAsMax ? null : end;
	}

	const rows = $derived.by(() => {
		if (filterStart === null && filterEnd === null) return allRows;
		return allRows.filter((r) => {
			const t = new Date(r.date).getTime();
			return t >= activeStart.getTime() && t <= activeEnd.getTime();
		});
	});

	const closedRows = $derived(rows.filter((r) => r.status === 'closed'));
	const openRows = $derived(rows.filter((r) => r.status === 'open'));
	const closedProfit = $derived(closedRows.reduce((s, r) => s + (r.pnl ?? 0), 0));
	const winners = $derived(closedRows.filter((r) => (r.pnl ?? 0) >= 0).length);
	const losers = $derived(closedRows.filter((r) => (r.pnl ?? 0) < 0).length);
</script>

<section class="mt-10">
	<div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
		<h2 class="text-lg font-semibold tracking-tight">Recent Activity</h2>
		<div class="ml-auto">
			<DateRangeFilter
				minDate={dateRange.min}
				maxDate={dateRange.max}
				startDate={activeStart}
				endDate={activeEnd}
				onchange={onFilterChange}
				defaultPick="3M"
				minimal
			/>
		</div>
	</div>

	{#if rows.length === 0}
		<div class="rounded-xl border border-border bg-surface-raised px-8 py-16 text-center">
			<p class="text-lg text-text-secondary">No activity in the selected range</p>
		</div>
	{:else}
		<div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
			<div class="rounded-xl border border-border bg-surface-raised px-4 py-3">
				<p class="text-xs text-text-secondary">Total</p>
				<p class="text-lg font-semibold">{rows.length}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-raised px-4 py-3">
				<p class="text-xs text-text-secondary">Opened</p>
				<p class="text-lg font-semibold text-brand">{openRows.length}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-raised px-4 py-3">
				<p class="text-xs text-text-secondary">Closed</p>
				<p class="text-lg font-semibold">{closedRows.length}</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-raised px-4 py-3">
				<p class="text-xs text-text-secondary">Realized P&L</p>
				<p class="text-lg font-semibold {pnlColor(closedProfit)}">
					{pnlSign(closedProfit)}{fmt.format(closedProfit)}
				</p>
			</div>
			<div class="rounded-xl border border-border bg-surface-raised px-4 py-3">
				<p class="text-xs text-text-secondary">Win Rate</p>
				<p class="text-lg font-semibold">
					{closedRows.length > 0 ? pctFmt.format((winners / closedRows.length) * 100) : '—'}
					{#if closedRows.length > 0}
						<span class="text-xs font-normal text-text-secondary">
							({winners}W / {losers}L)
						</span>
					{/if}
				</p>
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border border-border bg-surface-raised">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border text-left text-[10px] font-medium uppercase tracking-wider text-text-secondary">
							<th class="py-2.5 pl-5 pr-3">Date</th>
							<th class="px-3 py-2.5">Status</th>
							<th class="px-3 py-2.5">Symbol</th>
							<th class="px-3 py-2.5">Side</th>
							<th class="px-3 py-2.5 text-right">Invested</th>
							<th class="px-3 py-2.5 text-right">Open</th>
							<th class="px-3 py-2.5 text-right">Close / Current</th>
							<th class="px-3 py-2.5 text-right">Fees / Div</th>
							<th class="px-3 py-2.5 text-right">P&L</th>
							<th class="py-2.5 pl-3 pr-5 text-right">Return</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border/30">
						{#each rows as row, i (row.id || i)}
							<tr class="transition-colors hover:bg-surface-overlay/20">
								<td class="py-2.5 pl-5 pr-3 text-xs text-text-secondary">
									{dateFmt.format(new Date(row.date))}
								</td>
								<td class="px-3 py-2.5">
									{#if row.status === 'open'}
										<span class="inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">
											OPEN
										</span>
									{:else}
										<span class="inline-flex rounded-full bg-text-secondary/15 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
											CLOSED
										</span>
									{/if}
								</td>
								<td class="px-3 py-2.5">
									<div class="flex items-center gap-2">
										{#if row.logoUrl}
											<img src={row.logoUrl} alt={row.symbol} class="h-5 w-5 shrink-0 rounded-full" />
										{:else}
											<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[8px] font-bold text-text-secondary">
												{row.symbol.slice(0, 2)}
											</div>
										{/if}
										<span class="font-medium">{row.symbol}</span>
									</div>
								</td>
								<td class="px-3 py-2.5">
									<span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium {row.isBuy ? 'bg-gain/15 text-gain' : 'bg-loss/15 text-loss'}">
										{row.isBuy ? 'BUY' : 'SELL'}
									</span>
								</td>
								<td class="px-3 py-2.5 text-right tabular-nums">{fmt.format(row.invested)}</td>
								<td class="px-3 py-2.5 text-right tabular-nums text-text-secondary">{fmt.format(row.openRate)}</td>
								<td class="px-3 py-2.5 text-right tabular-nums text-text-secondary">
									{#if row.status === 'closed' && row.closeRate !== undefined}
										{fmt.format(row.closeRate)}
									{:else if row.currentRate !== undefined}
										{fmt.format(row.currentRate)}
									{:else}
										—
									{/if}
								</td>
								<td class="px-3 py-2.5 text-right tabular-nums {row.fees < 0 ? 'text-gain' : row.fees > 0 ? 'text-loss' : 'text-text-secondary'}">
									{row.fees !== 0 ? `${row.fees < 0 ? '+' : ''}${fmt.format(Math.abs(row.fees))}` : '—'}
								</td>
								<td class="px-3 py-2.5 text-right tabular-nums font-medium {pnlColor(row.pnl)}">
									{row.pnl !== undefined ? `${pnlSign(row.pnl)}${fmt.format(row.pnl)}` : '—'}
								</td>
								<td class="py-2.5 pl-3 pr-5 text-right tabular-nums {pnlColor(row.pnlPercent)}">
									{row.pnlPercent !== undefined ? `${pnlSign(row.pnlPercent)}${pctFmt.format(row.pnlPercent)}%` : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</section>
