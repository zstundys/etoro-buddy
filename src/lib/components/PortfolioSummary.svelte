<script lang="ts">
	import type { PortfolioData } from '$lib/etoro';
	import { currency as fmt, percent as pctFmt, pnlColor, pnlSign } from '$lib/format';

	let { portfolio }: { portfolio: PortfolioData } = $props();

	const totalValue = $derived(portfolio.totalInvested + portfolio.totalPnl);
	const totalPnlPercent = $derived(
		portfolio.totalInvested > 0 ? (portfolio.totalPnl / portfolio.totalInvested) * 100 : 0
	);
	const totalNetDividends = $derived(
		portfolio.positions.reduce((s, p) => s + Math.min(p.totalFees, 0), 0) * -1
	);
</script>

<div class="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
	<div class="rounded-xl border border-border bg-surface-raised px-5 py-4">
		<p class="text-xs font-medium uppercase tracking-wider text-text-secondary">Portfolio Value</p>
		<p class="mt-1 text-2xl font-semibold">{fmt.format(totalValue)}</p>
	</div>
	<div class="rounded-xl border border-border bg-surface-raised px-5 py-4">
		<p class="text-xs font-medium uppercase tracking-wider text-text-secondary">Total P&L</p>
		<p class="mt-1 text-2xl font-semibold {pnlColor(portfolio.totalPnl)}">
			{pnlSign(portfolio.totalPnl)}{fmt.format(portfolio.totalPnl)}
			<span class="ml-1 text-sm font-normal">({pnlSign(totalPnlPercent)}{pctFmt.format(totalPnlPercent)}%)</span>
		</p>
	</div>
	<div class="rounded-xl border border-border bg-surface-raised px-5 py-4">
		<p class="text-xs font-medium uppercase tracking-wider text-text-secondary">Invested</p>
		<p class="mt-1 text-2xl font-semibold">{fmt.format(portfolio.totalInvested)}</p>
	</div>
	<div class="rounded-xl border border-border bg-surface-raised px-5 py-4">
		<p class="text-xs font-medium uppercase tracking-wider text-text-secondary">Available</p>
		<p class="mt-1 text-2xl font-semibold">{fmt.format(portfolio.credit)}</p>
	</div>
	<div class="rounded-xl border border-border bg-surface-raised px-5 py-4">
		<p class="text-xs font-medium uppercase tracking-wider text-text-secondary">Dividends (net)</p>
		<p class="mt-1 text-2xl font-semibold text-gain">
			{totalNetDividends > 0 ? '+' : ''}{fmt.format(totalNetDividends)}
		</p>
		<p class="mt-0.5 text-xs text-text-secondary">from open positions</p>
	</div>
</div>
