<script lang="ts">
  import type { Candle } from "$lib/etoro-api";
  import { currency as fmt, percent as pctFmt } from "$lib/format";
  import { type OpportunityMetricKey, METRIC_LABELS } from "$lib/candle-utils";
  import type { BucketComputed } from "./target-allocation.svelte.ts";
  import {
    type AllocationMode,
    type DistributionMode,
    type FlatRow,
    FEE_PER_ORDER,
    buildMetricsMap,
    computeAllocations,
    buildFlatList,
  } from "./cash-allocation.ts";

  let {
    buckets,
    totalTargetPercent,
    totalAssignedMarketValue,
    credit = 0,
    candleMap = new Map(),
  }: {
    buckets: BucketComputed[];
    totalTargetPercent: number;
    totalAssignedMarketValue: number;
    credit?: number;
    candleMap?: Map<number, Candle[]>;
  } = $props();

  const ALL_METRICS: OpportunityMetricKey[] = [
    "diff200MA", "change1D", "change7D", "change1M", "change3M", "change6M", "changeYTD",
  ];

  let excludedSymbols = $state(new Set<string>());
  let cashAmount = $state(0);
  let allocationMode = $state<AllocationMode>("rebalance");
  let distributionMode = $state<DistributionMode>("proportional");
  let selectedMetric = $state<OpportunityMetricKey>("diff200MA");
  let sortByOpportunity = $state(false);
  let cashInitialized = $state(false);

  $effect(() => {
    if (credit > 0 && !cashInitialized) {
      cashAmount = Math.round(credit * 100) / 100;
      cashInitialized = true;
    }
  });

  function toggleSymbol(symbol: string) {
    const next = new Set(excludedSymbols);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    excludedSymbols = next;
  }

  const metricsMap = $derived(buildMetricsMap(buckets, candleMap));
  const hasMetrics = $derived(metricsMap.size > 0);

  const result = $derived(
    computeAllocations({
      buckets,
      totalTargetPercent,
      totalAssignedMarketValue,
      cashAmount,
      allocationMode,
      distributionMode,
      selectedMetric,
      excludedSymbols,
      metricsMap,
    }),
  );

  const fees = $derived(result.fees);

  const flatList = $derived(
    buildFlatList({
      allocations: result.allocations,
      buckets,
      sortByOpportunity,
      hasMetrics,
      selectedMetric,
    }),
  );

  const noValidBuckets = $derived(
    cashAmount > 0 && buckets.filter((b) => b.targetPercent > 0).length === 0,
  );

  const sortSummary = $derived.by(() => {
    const parts: string[] = [];
    if (sortByOpportunity) {
      parts.push(`Sorted by ${METRIC_LABELS[selectedMetric]} — lowest (most negative) values ranked first`);
    }
    if (distributionMode === "opportunity") {
      parts.push(`Cash weighted by ${METRIC_LABELS[selectedMetric]} — symbols further below get more`);
    } else {
      parts.push("Cash split proportionally by market value within each bucket");
    }
    if (allocationMode === "rebalance") {
      parts.push("Rebalance mode — underweight buckets receive more cash");
    } else {
      parts.push("Target % mode — cash divided by bucket target weights");
    }
    return parts;
  });

  type Tier = "active" | "zero" | "excluded";
  function rowTier(row: FlatRow): Tier {
    if (row.excluded) return "excluded";
    if (row.allocation < 0.01) return "zero";
    return "active";
  }
</script>

<div class="flex flex-col gap-3 rounded-lg border border-border bg-surface-overlay/20 p-3">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label class="flex items-center gap-2 text-xs text-text-secondary">
      Cash to deploy
      <div class="relative">
        <span class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary">$</span>
        <input
          type="number"
          min="0"
          step="10"
          bind:value={cashAmount}
          class="w-28 appearance-none rounded border border-border bg-surface-raised py-1 pl-5 pr-2 text-right text-sm tabular-nums text-text-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-brand focus:outline-none"
        />
      </div>
    </label>
    <div class="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
      <button
        type="button"
        class="rounded-md px-3 py-1 font-medium transition-colors {allocationMode === 'rebalance'
          ? 'bg-surface-raised text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => (allocationMode = "rebalance")}
      >
        Rebalance
      </button>
      <button
        type="button"
        class="rounded-md px-3 py-1 font-medium transition-colors {allocationMode === 'target'
          ? 'bg-surface-raised text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary'}"
        onclick={() => (allocationMode = "target")}
      >
        By target %
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
      <label class="flex items-center gap-1.5 text-xs text-text-secondary">
        <input
          type="checkbox"
          bind:checked={sortByOpportunity}
          class="h-3.5 w-3.5 rounded border-border accent-brand"
        />
        Sort by signal
      </label>
      <div class="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {distributionMode === 'proportional'
            ? 'bg-surface-raised text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (distributionMode = "proportional")}
        >
          Proportional
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {distributionMode === 'opportunity'
            ? 'bg-surface-raised text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => (distributionMode = "opportunity")}
          title="Allocate more cash to symbols furthest below their {METRIC_LABELS[selectedMetric]}"
        >
          By opportunity
        </button>
      </div>
    </div>
  {/if}

  {#if cashAmount > 0 && fees.orderCount > 0}
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums text-text-secondary">
      <span>
        {fees.orderCount} order{fees.orderCount === 1 ? "" : "s"}
        &times; {fmt.format(FEE_PER_ORDER)} fee
      </span>
      <span>
        Est. fees: <span class="font-medium text-text-primary">{fmt.format(fees.totalFees)}</span>
      </span>
    </div>
  {/if}

  {#if flatList.length > 0}
    {#if hasMetrics}
      <div class="flex flex-col gap-0.5 text-[10px] text-text-secondary">
        {#each sortSummary as line}
          <span>&bull; {line}</span>
        {/each}
      </div>
    {/if}
    <div class="flex flex-col gap-0.5">
      {#each flatList as row, i (row.symbol)}
        {@const mv = row.excluded ? undefined : row.metrics?.[selectedMetric]}
        {@const tier = rowTier(row)}
        {@const prevTier = i > 0 ? rowTier(flatList[i - 1]) : tier}
        {#if tier !== prevTier}
          <div class="my-1 border-t border-border/50"></div>
        {/if}
        <div class="flex items-center gap-2 rounded px-1 py-0.5 text-xs {tier === 'excluded' ? 'opacity-40' : tier === 'zero' ? 'opacity-50' : ''}">
          <button
            type="button"
            title={row.excluded ? `Include ${row.symbol}` : `Exclude ${row.symbol}`}
            class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors {row.excluded
              ? 'border-border bg-surface-raised'
              : 'border-brand bg-brand/15'}"
            onclick={() => toggleSymbol(row.symbol)}
          >
            {#if !row.excluded}
              <svg class="h-2.5 w-2.5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            {/if}
          </button>
          {#if row.rank > 0}
            <span class="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-surface-raised text-[9px] font-bold tabular-nums text-text-secondary">
              {row.rank}
            </span>
          {/if}
          <span class="shrink-0 font-medium text-text-primary {row.excluded ? 'line-through' : ''}">{row.symbol}</span>
          <span
            class="inline-block h-2 w-2 shrink-0 rounded-sm"
            style="background:{row.bucketColor}"
            title={row.bucketName}
          ></span>
          <span class="truncate text-[10px] text-text-secondary">{row.bucketName}</span>
          {#if mv != null}
            <span
              class="shrink-0 tabular-nums text-[10px] {mv < 0 ? 'text-gain' : 'text-loss'}"
              title="{METRIC_LABELS[selectedMetric]}: {pctFmt.format(mv)}%{row.rank > 0 ? ` (rank #${row.rank})` : ''}"
            >
              {pctFmt.format(mv)}%
            </span>
          {/if}
          <span class="ml-auto shrink-0 tabular-nums font-medium {row.excluded ? 'text-text-secondary' : 'text-text-primary'}">
            {fmt.format(row.allocation)}
          </span>
          <span class="shrink-0 tabular-nums text-text-secondary">
            {fmt.format(row.currentValue)}
          </span>
        </div>
      {/each}
    </div>
  {:else if cashAmount <= 0}
    <p class="text-xs text-text-secondary">Enter an amount above to preview allocation.</p>
  {:else if noValidBuckets}
    <p class="text-xs text-text-secondary">No buckets have a target percentage set. Edit buckets to assign targets.</p>
  {/if}
</div>
