<script lang="ts">
  import type { Candle } from "$lib/etoro-api";
  import { currency as fmt, percent as pctFmt } from "$lib/format";
  import { type OpportunityMetricKey, METRIC_LABELS } from "$lib/candle-utils";
  import type { BucketComputed } from "./target-allocation.svelte.ts";
  import {
    type AllocationMode,
    type WithinBucketStrategy,
    type PortfolioSymbol,
    type FlatRow,
    type ModePreview,
    type Recommendation,
    FEE_PER_ORDER,
    MIN_ORDER_AMOUNT,
    buildMetricsMap,
    computeAllocations,
    computeAllModes,
    computeRecommendation,
    buildFlatList,
  } from "./cash-allocation.ts";

  let {
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    allSymbols = [],
    availableCash = 0,
    candleMap = new Map(),
  }: {
    buckets: BucketComputed[];
    totalTargetPercent: number;
    totalAssignedMarketValue: number;
    allSymbols?: PortfolioSymbol[];
    availableCash?: number;
    candleMap?: Map<number, Candle[]>;
  } = $props();

  const ALL_METRICS: OpportunityMetricKey[] = [
    "diff200MA",
    "change1D",
    "change7D",
    "change1M",
    "change3M",
    "change6M",
    "changeYTD",
  ];

  let excludedSymbols = $state(new Set<string>());
  let forcedSymbols = $state(new Set<string>());
  let cashAmount = $state(0);
  let allocationMode = $state<AllocationMode>("rebalance");
  let selectedMetric = $state<OpportunityMetricKey>("diff200MA");
  let cashInitialized = $state(false);
  let preferUndervalued = $state(false);

  $effect(() => {
    if (availableCash > 0 && !cashInitialized) {
      cashAmount = Math.round(availableCash * 100) / 100;
      cashInitialized = true;
    }
  });

  const hasBucketTargets = $derived(buckets.some((b) => b.targetPercent > 0));

  $effect(() => {
    if (
      !hasBucketTargets &&
      allocationMode !== "opportunity" &&
      allocationMode !== "equal"
    ) {
      allocationMode = "equal";
    }
  });

  function toggleSymbol(symbol: string) {
    const next = new Set(excludedSymbols);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    excludedSymbols = next;
  }

  function toggleForced(symbol: string) {
    const next = new Set(forcedSymbols);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    forcedSymbols = next;
  }

  const metricsMap = $derived(buildMetricsMap(allSymbols, candleMap));
  const hasMetrics = $derived(metricsMap.size > 0);

  const withinStrategy = $derived<WithinBucketStrategy>(
    preferUndervalued && hasMetrics ? "signal-weighted" : "market-value",
  );

  const result = $derived(
    computeAllocations({
      buckets,
      totalTargetPercent,
      totalAssignedMarketValue,
      cashAmount,
      allocationMode,
      selectedMetric,
      excludedSymbols,
      forcedSymbols,
      metricsMap,
      allSymbols,
      withinBucketStrategy: withinStrategy,
    }),
  );

  const totalPortfolioValue = $derived(
    allSymbols.reduce((sum, s) => sum + s.marketValue, 0),
  );

  const fees = $derived(result.fees);
  const projections = $derived(result.projections);
  const rebalanceProgress = $derived(result.rebalanceProgress);

  const flatList = $derived(
    buildFlatList({
      allocations: result.allocations,
      buckets,
      allocationMode,
      hasMetrics,
      selectedMetric,
      forcedSymbols,
    }),
  );

  const modePreviews = $derived<ModePreview[]>(
    computeAllModes({
      buckets,
      totalTargetPercent,
      totalAssignedMarketValue,
      cashAmount,
      selectedMetric,
      excludedSymbols,
      forcedSymbols,
      metricsMap,
      allSymbols,
      withinBucketStrategy: withinStrategy,
      hasBucketTargets,
      hasMetrics,
    }),
  );

  const recommendation = $derived<Recommendation | null>(
    computeRecommendation({
      previews: modePreviews,
      buckets,
      totalAssignedMarketValue,
      cashAmount,
      metricsMap,
      selectedMetric,
    }),
  );

  type Tier = "active" | "forced" | "zero" | "excluded";
  function rowTier(row: FlatRow): Tier {
    if (row.excluded) return "excluded";
    if (row.allocation < 0.01 && !row.forced) return "zero";
    if (row.forced) return "forced";
    return "active";
  }

  type DisplayTier = "priority" | "secondary" | "belowMin" | "excluded";
  function displayTier(row: FlatRow): DisplayTier {
    if (row.excluded) return "excluded";
    if (row.belowMinimum || row.allocation < MIN_ORDER_AMOUNT)
      return "belowMin";
    if (row.allocation >= 50) return "priority";
    return "secondary";
  }

  const tieredRows = $derived.by(() => {
    const priority: FlatRow[] = [];
    const secondary: FlatRow[] = [];
    const belowMin: FlatRow[] = [];
    const excluded: FlatRow[] = [];
    for (const row of flatList) {
      const t = displayTier(row);
      if (t === "priority") priority.push(row);
      else if (t === "secondary") secondary.push(row);
      else if (t === "belowMin") belowMin.push(row);
      else excluded.push(row);
    }
    return { priority, secondary, belowMin, excluded };
  });

  let showBelowMin = $state(false);
  let showExcluded = $state(false);
  let copiedSymbol = $state<string | null>(null);

  async function copyAmount(symbol: string, amount: number) {
    try {
      await navigator.clipboard.writeText(amount.toFixed(2));
      copiedSymbol = symbol;
      setTimeout(() => {
        if (copiedSymbol === symbol) copiedSymbol = null;
      }, 1200);
    } catch {
      /* clipboard not available */
    }
  }

  const INFO_TEXT =
    "Simulates deploying your available cash (credit minus pending orders) across four modes. " +
    "Rebalance directs cash to underweight buckets proportionally to their shortfall. " +
    "By target % splits cash according to bucket weights. " +
    "By opportunity ignores buckets entirely and favors stocks with the weakest signal (most discounted). " +
    "Equal split divides cash evenly across all included holdings. " +
    "Uncheck a row to exclude it — its share redistributes to the rest. " +
    "Rows at $0 can be force-included via the checkbox; they appear under \"Not prioritized\" and receive a proportional share. " +
    "Amber rows are below eToro's $10 minimum order size.";

  let showInfo = $state(false);
</script>

{#snippet rowGrid(
  rows: FlatRow[],
  showRank: boolean,
  showBucket: boolean,
  showSignal: boolean,
  dimmed?: boolean,
)}
  {#each rows as row (row.symbol)}
    {@const mv = row.excluded ? undefined : row.metrics?.[selectedMetric]}
    {@const tier = rowTier(row)}
    {@const zeroNonExcluded = !row.excluded && row.allocation < 0.01}

    <!-- checkbox -->
    <button
      type="button"
      title={zeroNonExcluded
        ? `Force-include ${row.symbol}`
        : row.excluded
          ? `Include ${row.symbol}`
          : row.forced
            ? `Remove forced inclusion for ${row.symbol}`
            : `Exclude ${row.symbol}`}
      class="flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors
        {dimmed || tier === 'excluded'
        ? 'opacity-40'
        : tier === 'zero'
          ? 'opacity-50'
          : ''}
        {row.excluded
        ? 'border-border bg-surface-raised'
        : zeroNonExcluded
          ? 'border-border/50 bg-surface-raised/50 hover:border-amber-500/50 cursor-pointer'
          : row.forced
            ? 'border-amber-500 bg-amber-500/15'
            : 'border-brand bg-brand/15'}"
      onclick={() =>
        zeroNonExcluded
          ? toggleForced(row.symbol)
          : row.forced
            ? toggleForced(row.symbol)
            : toggleSymbol(row.symbol)}
    >
      {#if (!row.excluded && !zeroNonExcluded) || row.forced}
        <svg
          class="h-2.5 w-2.5 {row.forced ? 'text-amber-500' : 'text-brand'}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      {/if}
    </button>

    <!-- rank -->
    {#if showRank}
      <span
        class="text-center {dimmed || tier === 'excluded'
          ? 'opacity-40'
          : tier === 'zero'
            ? 'opacity-50'
            : ''}"
      >
        {#if row.rank > 0}
          <span
            class="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-surface-raised text-[9px] font-bold tabular-nums text-text-secondary"
          >
            {row.rank}
          </span>
        {/if}
      </span>
    {/if}

    <!-- symbol -->
    <span
      class="truncate font-medium text-text-primary {dimmed ||
      tier === 'excluded'
        ? 'opacity-40 line-through'
        : tier === 'zero'
          ? 'opacity-50'
          : ''}"
    >
      {row.symbol}
    </span>

    <!-- current % of portfolio -->
    <span
      class="text-right tabular-nums text-[10px] text-text-secondary/70 {dimmed ||
      tier === 'excluded'
        ? 'opacity-40'
        : tier === 'zero'
          ? 'opacity-50'
          : ''}"
      title="{pctFmt.format(
        totalPortfolioValue > 0
          ? (row.currentValue / totalPortfolioValue) * 100
          : 0,
      )}% of portfolio"
    >
      {#if totalPortfolioValue > 0}
        {pctFmt.format((row.currentValue / totalPortfolioValue) * 100)}%
      {/if}
    </span>

    <!-- bucket swatch + name -->
    {#if showBucket}
      <span
        class="inline-block h-2 w-2 rounded-sm {dimmed || tier === 'excluded'
          ? 'opacity-40'
          : tier === 'zero'
            ? 'opacity-50'
            : ''}"
        style="background:{row.bucketColor || 'transparent'}"
        title={row.bucketName}
      ></span>
      <span
        class="truncate text-[10px] text-text-secondary {dimmed ||
        tier === 'excluded'
          ? 'opacity-40'
          : tier === 'zero'
            ? 'opacity-50'
            : ''}"
      >
        {row.bucketName}
      </span>
    {/if}

    <!-- signal metric -->
    {#if showSignal}
      <span
        class="text-right tabular-nums text-[10px] {dimmed ||
        tier === 'excluded'
          ? 'opacity-40'
          : tier === 'zero'
            ? 'opacity-50'
            : ''}"
        title={mv != null
          ? `${METRIC_LABELS[selectedMetric]}: ${pctFmt.format(mv)}%${row.rank > 0 ? ` (rank #${row.rank})` : ""}`
          : ""}
      >
        {#if mv != null}
          <span class={mv < 0 ? "text-gain" : "text-loss"}>
            {pctFmt.format(mv)}%
          </span>
          <span class="{mv < 0 ? 'text-gain' : 'text-loss'} opacity-50"
            >{METRIC_LABELS[selectedMetric]}</span
          >
        {/if}
      </span>
    {/if}

    <!-- reason -->
    <span
      class="truncate px-1 text-[10px] {dimmed || tier === 'excluded'
        ? 'opacity-40'
        : tier === 'zero'
          ? 'opacity-50'
          : ''}
      {row.belowMinimum
        ? 'text-amber-500'
        : row.forced
          ? 'text-amber-500/80'
          : 'text-text-secondary'}"
      title={row.reason ?? ""}
    >
      {#if row.reason && !row.excluded}
        {row.reason}
      {/if}
    </span>

    <!-- allocation amount (click to copy) -->
    <button
      type="button"
      class="text-right tabular-nums font-medium transition-colors cursor-pointer
        {dimmed || tier === 'excluded'
        ? 'opacity-40'
        : tier === 'zero'
          ? 'opacity-50'
          : ''}
        {copiedSymbol === row.symbol
        ? 'text-brand'
        : row.belowMinimum
          ? 'text-amber-500 hover:text-amber-400'
          : row.forced
            ? 'text-amber-500 hover:text-amber-400'
            : row.excluded
              ? 'text-text-secondary'
              : 'text-text-primary hover:text-brand'}"
      title="Click to copy amount"
      onclick={() => copyAmount(row.symbol, row.allocation)}
    >
      {#if copiedSymbol === row.symbol}
        Copied!
      {:else}
        {fmt.format(row.allocation)}
      {/if}
    </button>
  {/each}
{/snippet}

<div
  class="flex flex-col gap-3 rounded-lg border border-border bg-surface-overlay/20 p-3"
>
  <div class="flex items-center gap-2">
    <h4
      class="text-xs font-medium uppercase tracking-wider text-text-secondary"
    >
      Cash Allocation
    </h4>
    <button
      type="button"
      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-secondary/50 transition-colors hover:bg-surface-overlay hover:text-text-primary"
      class:bg-surface-overlay={showInfo}
      class:text-text-primary={showInfo}
      onclick={() => (showInfo = !showInfo)}
      title="About cash allocation"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    </button>
  </div>
  {#if showInfo}
    <p
      class="text-pretty rounded-lg bg-surface-overlay/50 px-3 py-2 text-xs leading-relaxed text-text-secondary"
    >
      {INFO_TEXT}
    </p>
  {/if}

  <!-- Cash input -->
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label class="flex items-center gap-2 text-xs text-text-secondary">
      Cash to deploy
      <div class="relative">
        <span
          class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary"
          >$</span
        >
        <input
          type="number"
          min="0"
          step="10"
          bind:value={cashAmount}
          class="w-28 rounded border border-border bg-surface-raised py-1 pl-5 pr-2 text-right text-sm tabular-nums text-text-primary focus:border-brand focus:outline-none"
        />
      </div>
    </label>
    {#if hasMetrics}
      <label class="flex items-center gap-2 text-xs text-text-secondary">
        Signal
        <select
          bind:value={selectedMetric}
          class="rounded border border-border bg-surface-raised px-2 py-1 text-xs text-text-primary focus:border-brand focus:outline-none"
        >
          {#each ALL_METRICS as key (key)}
            <option value={key}>{METRIC_LABELS[key]}</option>
          {/each}
        </select>
      </label>
      {#if allocationMode !== "opportunity" && allocationMode !== "equal"}
        <label class="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            bind:checked={preferUndervalued}
            class="h-3 w-3 rounded border-border accent-brand"
          />
          Prefer undervalued
        </label>
      {/if}
    {/if}
  </div>

  <!-- Recommendation banner -->
  {#if recommendation && cashAmount > 0}
    <button
      type="button"
      class="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors
        {allocationMode === recommendation.mode
        ? 'border-brand/40 bg-brand/10'
        : 'border-border/60 bg-surface-overlay/40 hover:border-brand/30 hover:bg-brand/5'}"
      onclick={() => (allocationMode = recommendation.mode)}
    >
      <div class="flex items-center gap-2">
        <svg
          class="h-3.5 w-3.5 shrink-0 text-brand"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          />
        </svg>
        <span class="text-xs font-semibold text-text-primary">
          Suggested: {recommendation.label}
        </span>
        {#if allocationMode !== recommendation.mode}
          <span class="ml-auto text-[10px] text-brand">Click to apply</span>
        {/if}
      </div>
      <p class="text-[11px] leading-relaxed text-text-secondary">
        {recommendation.summary}.
        {#if recommendation.topSymbols.length > 0}
          Top: {recommendation.topSymbols
            .map((s) => `${s.symbol} (${fmt.format(s.allocation)})`)
            .join(", ")}.
        {/if}
      </p>
    </button>
  {/if}

  <!-- Side-by-side mode comparison cards -->
  {#if modePreviews.length > 1 && cashAmount > 0}
    <div
      class="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0"
      style:grid-template-columns="repeat({modePreviews.length}, 1fr)"
    >
      {#each modePreviews as preview (preview.mode)}
        {@const isActive = allocationMode === preview.mode}
        {@const topAllocs = preview.topSymbols}
        {@const maxAlloc = topAllocs.length > 0 ? topAllocs[0].allocation : 0}
        <button
          type="button"
          class="flex min-w-56 flex-1 flex-col gap-1.5 rounded-lg border p-2 text-left transition-all sm:min-w-0
            {isActive
            ? 'border-brand/50 bg-brand/10 shadow-sm'
            : 'border-border/40 bg-surface-overlay/20 hover:border-border hover:bg-surface-overlay/40'}"
          onclick={() => (allocationMode = preview.mode)}
        >
          <span
            class="text-[10px] font-semibold uppercase tracking-wider {isActive
              ? 'text-brand'
              : 'text-text-secondary'}"
          >
            {preview.label}
          </span>
          <!-- Mini horizontal bars -->
          <div class="flex flex-col gap-0.5">
            {#each topAllocs as sym (sym.symbol)}
              <div class="flex items-center gap-1.5">
                <span
                  class="w-10 truncate text-[9px] tabular-nums text-text-secondary"
                  >{sym.symbol}</span
                >
                <div
                  class="h-1.5 flex-1 rounded-full bg-surface-raised overflow-hidden"
                >
                  <div
                    class="h-full rounded-full transition-all {isActive
                      ? 'bg-brand'
                      : 'bg-text-secondary/30'}"
                    style="width:{maxAlloc > 0
                      ? (sym.allocation / maxAlloc) * 100
                      : 0}%"
                  ></div>
                </div>
                <span
                  class="w-8 text-right text-[9px] tabular-nums text-text-secondary"
                >
                  {fmt.format(sym.allocation)}
                </span>
              </div>
            {/each}
          </div>
          <!-- Stats -->
          <div
            class="flex items-center gap-2 text-[9px] tabular-nums text-text-secondary/70"
          >
            <span>{preview.result.fees.orderCount} orders</span>
            <span>&middot;</span>
            <span>{fmt.format(preview.result.fees.totalFees)} fees</span>
            {#if preview.result.rebalanceProgress != null}
              <span>&middot;</span>
              <span>{preview.result.rebalanceProgress}% gap closed</span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}

  <!-- Fee summary -->
  {#if cashAmount > 0 && fees.orderCount > 0}
    <div
      class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums text-text-secondary"
    >
      <span>
        Est. fees: <span class="font-medium text-text-primary"
          >{fmt.format(fees.totalFees)}</span
        >
        <span>
          ({fees.orderCount} order{fees.orderCount === 1 ? "" : "s"}
          &times; {fmt.format(FEE_PER_ORDER)} fee)
        </span>
      </span>
      {#if fees.belowMinCount > 0}
        <span class="text-amber-500">
          {fees.belowMinCount} symbol{fees.belowMinCount === 1 ? "" : "s"} below ${MIN_ORDER_AMOUNT}
          min
        </span>
      {/if}
    </div>
  {/if}

  <!-- Projections (bucket-based modes) -->
  {#if projections.length > 0 && cashAmount > 0}
    <div class="flex flex-col gap-0.5 text-[10px]">
      {#each projections as p (p.bucketId)}
        {@const movingToward =
          Math.abs(p.afterPercent - p.targetPercent) <
          Math.abs(p.beforePercent - p.targetPercent)}
        <div class="flex items-center gap-2 text-text-secondary">
          <span class="w-20 truncate font-medium">{p.bucketName}</span>
          <span class="tabular-nums">{p.beforePercent.toFixed(1)}%</span>
          <span class={movingToward ? "text-gain" : "text-loss"}>&rarr;</span>
          <span class="tabular-nums {movingToward ? 'text-gain' : 'text-loss'}"
            >{p.afterPercent.toFixed(1)}%</span
          >
          <span class="text-text-secondary/60">(target {p.targetPercent}%)</span
          >
        </div>
      {/each}
      {#if rebalanceProgress != null}
        <div class="mt-1 flex items-center gap-2">
          <div class="h-1.5 flex-1 rounded-full bg-surface-raised">
            <div
              class="h-full rounded-full bg-brand transition-all"
              style="width:{Math.min(rebalanceProgress, 100)}%"
            ></div>
          </div>
          <span class="shrink-0 text-[10px] tabular-nums text-text-secondary">
            Closes {rebalanceProgress}% of gap
          </span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Tiered allocation rows -->
  {#if flatList.length > 0}
    {@const showRank = flatList.some((r) => r.rank > 0)}
    {@const showBucket = flatList.some((r) => r.bucketName)}
    {@const showSignal = flatList.some(
      (r) => !r.excluded && r.metrics?.[selectedMetric] != null,
    )}
    {@const gridCols = `14px ${showRank ? "20px " : ""}auto 2.5rem ${showBucket ? "10px minmax(0,5rem) " : ""}${showSignal ? "5.5rem " : ""}1fr max-content`}

    <div class="overflow-x-auto">
      <!-- Priority tier -->
      {#if tieredRows.priority.length > 0}
        <div>
          <span
            class="sticky left-0 text-[10px] font-medium uppercase tracking-wider text-text-secondary/60"
          >
            Priority
          </span>
          <div
            class="grid items-center gap-y-0.5 gap-x-3 text-xs"
            style="grid-template-columns:{gridCols};"
          >
            {@render rowGrid(
              tieredRows.priority,
              showRank,
              showBucket,
              showSignal,
            )}
          </div>
        </div>
      {/if}

      <!-- Secondary tier -->
      {#if tieredRows.secondary.length > 0}
        <div>
          {#if tieredRows.priority.length > 0}
            <div class="sticky left-0 border-t border-border/30 pt-1.5"></div>
          {/if}
          <span
            class="sticky left-0 text-[10px] font-medium uppercase tracking-wider text-text-secondary/60"
          >
            Secondary
          </span>
          <div
            class="grid items-center gap-y-0.5 gap-x-3 text-xs"
            style="grid-template-columns:{gridCols};"
          >
            {@render rowGrid(
              tieredRows.secondary,
              showRank,
              showBucket,
              showSignal,
            )}
          </div>
        </div>
      {/if}

      <!-- Below minimum tier (collapsed by default) -->
      {#if tieredRows.belowMin.length > 0}
        <div>
          <div class="sticky left-0 border-t border-border/30 pt-1.5"></div>
          <button
            type="button"
            class="sticky left-0 flex w-max items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-500/70 hover:text-amber-500 transition-colors"
            onclick={() => (showBelowMin = !showBelowMin)}
          >
            <svg
              class="h-2.5 w-2.5 shrink-0 transition-transform duration-150"
              class:rotate-90={showBelowMin}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Below ${MIN_ORDER_AMOUNT} minimum — {tieredRows.belowMin.length} symbol{tieredRows
              .belowMin.length === 1
              ? ""
              : "s"}
          </button>
          {#if showBelowMin}
            <div
              class="grid items-center gap-y-0.5 gap-x-3 text-xs"
              style="grid-template-columns:{gridCols};"
            >
              {@render rowGrid(
                tieredRows.belowMin,
                showRank,
                showBucket,
                showSignal,
                true,
              )}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Excluded tier (collapsed by default) -->
      {#if tieredRows.excluded.length > 0}
        <div>
          <div class="sticky left-0 border-t border-border/30 pt-1.5"></div>
          <button
            type="button"
            class="sticky left-0 flex w-max items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-text-secondary/50 hover:text-text-secondary transition-colors"
            onclick={() => (showExcluded = !showExcluded)}
          >
            <svg
              class="h-2.5 w-2.5 shrink-0 transition-transform duration-150"
              class:rotate-90={showExcluded}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Excluded — {tieredRows.excluded.length} symbol{tieredRows.excluded
              .length === 1
              ? ""
              : "s"}
          </button>
          {#if showExcluded}
            <div
              class="grid items-center gap-y-0.5 gap-x-3 text-xs"
              style="grid-template-columns:{gridCols};"
            >
              {@render rowGrid(
                tieredRows.excluded,
                showRank,
                showBucket,
                showSignal,
                true,
              )}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else if cashAmount <= 0}
    <p class="text-xs text-text-secondary">
      Enter an amount above to preview allocation.
    </p>
  {:else if allocationMode !== "opportunity" && allocationMode !== "equal" && !hasBucketTargets}
    <p class="text-xs text-text-secondary">
      No buckets have a target percentage set. Edit buckets to assign targets.
    </p>
  {/if}
</div>
