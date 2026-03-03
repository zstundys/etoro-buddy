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
    FEE_PER_ORDER,
    MIN_ORDER_AMOUNT,
    buildMetricsMap,
    computeAllocations,
    buildFlatList,
  } from "./cash-allocation.ts";

  let {
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    allSymbols = [],
    credit = 0,
    candleMap = new Map(),
  }: {
    buckets: BucketComputed[];
    totalTargetPercent: number;
    totalAssignedMarketValue: number;
    allSymbols?: PortfolioSymbol[];
    credit?: number;
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
    if (credit > 0 && !cashInitialized) {
      cashAmount = Math.round(credit * 100) / 100;
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

  const sortSummary = $derived.by(() => {
    const parts: string[] = [];
    if (allocationMode === "equal") {
      parts.push(
        "Equal split — cash divided equally across all included holdings",
      );
    } else if (allocationMode === "opportunity") {
      parts.push(
        `Cash weighted by ${METRIC_LABELS[selectedMetric]} — symbols further below get more`,
      );
      parts.push(
        `Sorted by ${METRIC_LABELS[selectedMetric]} — lowest (most negative) values ranked first`,
      );
    } else if (allocationMode === "rebalance") {
      parts.push(
        "Rebalance — underweight buckets receive proportionally to shortfall",
      );
    } else {
      parts.push("By target % — cash divided by bucket target weights");
    }
    if (
      preferUndervalued &&
      allocationMode !== "opportunity" &&
      allocationMode !== "equal"
    ) {
      parts.push(
        "Within each bucket, undervalued symbols (by signal) receive more",
      );
    }
    return parts;
  });

  type Tier = "active" | "forced" | "zero" | "excluded";
  function rowTier(row: FlatRow): Tier {
    if (row.excluded) return "excluded";
    if (row.allocation < 0.01 && !row.forced) return "zero";
    if (row.forced) return "forced";
    return "active";
  }

  const INFO_TEXT =
    "Preview how available cash could be allocated across your portfolio. " +
    "Rebalance directs cash to underweight buckets proportionally to their shortfall. " +
    "By target % divides cash by bucket target weights. " +
    "By opportunity ignores buckets and weights cash toward stocks with the weakest signal (most discounted). " +
    "Equal split divides cash equally across all included holdings. " +
    "Use the checkbox to exclude specific instruments — their share redistributes to others. " +
    "Amber rows are below eToro's $10 minimum order.";

  let showInfo = $state(false);
</script>

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
          class="w-28 appearance-none rounded border border-border bg-surface-raised py-1 pl-5 pr-2 text-right text-sm tabular-nums text-text-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-brand focus:outline-none"
        />
      </div>
    </label>
    <div
      class="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs"
    >
      {#if hasBucketTargets}
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {allocationMode ===
          'rebalance'
            ? 'bg-surface-raised text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (allocationMode = "rebalance")}
        >
          Rebalance
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {allocationMode ===
          'target'
            ? 'bg-surface-raised text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (allocationMode = "target")}
        >
          By target %
        </button>
      {/if}
      {#if hasMetrics}
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {allocationMode ===
          'opportunity'
            ? 'bg-surface-raised text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (allocationMode = "opportunity")}
        >
          By opportunity
        </button>
      {/if}
      <button
        type="button"
        class="rounded-md px-3 py-1 font-medium transition-colors {allocationMode ===
        'equal'
          ? 'bg-surface-raised text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => (allocationMode = "equal")}
      >
        Equal split
      </button>
    </div>
  </div>

  {#if hasMetrics}
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
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
    </div>
  {/if}

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

  {#if flatList.length > 0}
    <div class="flex flex-col gap-0.5 text-[10px] text-text-secondary">
      {#each sortSummary as line}
        <span>&bull; {line}</span>
      {/each}
    </div>
    {@const showRank = flatList.some((r) => r.rank > 0)}
    {@const showBucket = flatList.some((r) => r.bucketName)}
    {@const showSignal = flatList.some(
      (r) => !r.excluded && r.metrics?.[selectedMetric] != null,
    )}
    <div
      class="grid items-center gap-y-0.5 gap-x-3 text-xs"
      style="grid-template-columns:
        14px
        {showRank ? '20px ' : ''}
        auto
        {showBucket ? '10px minmax(0, 5rem) ' : ''}
        {showSignal ? '3.5rem ' : ''}
        1fr
        max-content;"
    >
      {#each flatList as row, i (row.symbol)}
        {@const mv = row.excluded ? undefined : row.metrics?.[selectedMetric]}
        {@const tier = rowTier(row)}
        {@const prevTier = i > 0 ? rowTier(flatList[i - 1]) : tier}
        {@const zeroNonExcluded = !row.excluded && row.allocation < 0.01}
        {@const cols =
          4 + (showRank ? 1 : 0) + (showBucket ? 2 : 0) + (showSignal ? 1 : 0)}
        {#if tier !== prevTier}
          {#if (prevTier === "active" || prevTier === "forced") && tier === "zero"}
            <div
              class="col-span-full my-1.5 flex items-center gap-2 border-t border-border/50 pt-1.5"
            >
              <span
                class="text-[10px] font-medium uppercase tracking-wider text-text-secondary/60"
                >Not prioritized</span
              >
            </div>
          {:else}
            <div class="col-span-full my-1 border-t border-border/50"></div>
          {/if}
        {/if}

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
            {tier === 'excluded'
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
            class="text-center {tier === 'excluded'
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
          class="truncate font-medium text-text-primary {tier === 'excluded'
            ? 'opacity-40 line-through'
            : tier === 'zero'
              ? 'opacity-50'
              : ''}"
        >
          {row.symbol}
        </span>

        <!-- bucket swatch + name -->
        {#if showBucket}
          <span
            class="inline-block h-2 w-2 rounded-sm {tier === 'excluded'
              ? 'opacity-40'
              : tier === 'zero'
                ? 'opacity-50'
                : ''}"
            style="background:{row.bucketColor || 'transparent'}"
            title={row.bucketName}
          ></span>
          <span
            class="truncate text-[10px] text-text-secondary {tier === 'excluded'
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
            class="text-right tabular-nums text-[10px] {tier === 'excluded'
              ? 'opacity-40'
              : tier === 'zero'
                ? 'opacity-50'
                : ''}
            {mv != null ? (mv < 0 ? 'text-gain' : 'text-loss') : ''}"
          >
            {#if mv != null}
              <span
                title="{METRIC_LABELS[selectedMetric]}: {pctFmt.format(
                  mv,
                )}%{row.rank > 0 ? ` (rank #${row.rank})` : ''}"
              >
                {pctFmt.format(mv)}%
              </span>
            {/if}
          </span>
        {/if}

        <!-- reason -->
        <span
          class="truncate px-1 text-[10px] {tier === 'excluded'
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

        <!-- allocation amount -->
        <span
          class="text-right tabular-nums font-medium {tier === 'excluded'
            ? 'opacity-40'
            : tier === 'zero'
              ? 'opacity-50'
              : ''}
          {row.belowMinimum
            ? 'text-amber-500'
            : row.forced
              ? 'text-amber-500'
              : row.excluded
                ? 'text-text-secondary'
                : 'text-text-primary'}"
        >
          {fmt.format(row.allocation)}
        </span>
      {/each}
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
