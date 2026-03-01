<script lang="ts">
  import type { PortfolioData } from "$lib/etoro-api";
  import { percent as pctFmt, pnlColor, pnlSign } from "$lib/format";
  import Money from "./Money.svelte";

  let { portfolio }: { portfolio: PortfolioData } = $props();

  const totalValue = $derived(portfolio.totalInvested + portfolio.totalPnl);
  const totalPnlPercent = $derived(
    portfolio.totalInvested > 0
      ? (portfolio.totalPnl / portfolio.totalInvested) * 100
      : 0,
  );
  const totalNetDividends = $derived(
    portfolio.positions.reduce((s, p) => s + Math.min(p.totalFees, 0), 0) * -1,
  );
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
  <div class="grid gap-3 rounded-xl border border-border bg-surface-raised p-5">
    <p class="text-xs font-medium uppercase tracking-wider text-text-secondary">
      Portfolio Value
    </p>
    <p class="text-2xl font-semibold"><Money value={totalValue} /></p>
  </div>
  <div class="grid gap-3 rounded-xl border border-border bg-surface-raised p-5">
    <div class="flex items-baseline justify-between">
      <p
        class="text-xs font-medium uppercase tracking-wider text-text-secondary"
      >
        Total P&L
      </p>
      <p class="text-sm font-medium {pnlColor(totalPnlPercent)}">
        {pnlSign(totalPnlPercent)}{pctFmt.format(totalPnlPercent)}%
      </p>
    </div>
    <p class="text-2xl font-semibold">
      <Money value={portfolio.totalPnl} showSign />
    </p>
  </div>
  <div class="grid gap-3 rounded-xl border border-border bg-surface-raised p-5">
    <p class="text-xs font-medium uppercase tracking-wider text-text-secondary">
      Invested
    </p>
    <p class="text-2xl font-semibold">
      <Money value={portfolio.totalInvested} />
    </p>
  </div>
  <div class="grid gap-3 rounded-xl border border-border bg-surface-raised p-5">
    <p class="text-xs font-medium uppercase tracking-wider text-text-secondary">
      Available
    </p>
    <p class="text-2xl font-semibold"><Money value={portfolio.credit} /></p>
  </div>
  <div class="grid gap-3 rounded-xl border border-border bg-surface-raised p-5">
    <p class="text-xs font-medium uppercase tracking-wider text-text-secondary">
      Dividends (net)
    </p>
    <p class="text-2xl font-semibold">
      <Money
        value={totalNetDividends}
        signOverride={totalNetDividends > 0 ? "+" : ""}
      />
    </p>
  </div>
</div>

<style>
  p {
    text-box: trim-both cap alphabetic;
  }
</style>
