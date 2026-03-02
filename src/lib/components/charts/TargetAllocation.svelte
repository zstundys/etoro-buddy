<script lang="ts">
  import type { EnrichedPosition, Candle } from "$lib/etoro-api";
  import { currency as fmt, percent as pctFmt } from "$lib/format";
  import {
    createBucketStore,
    bucketColor,
    THRESHOLD,
  } from "./target-allocation.svelte.ts";
  import TargetAllocationChart from "./TargetAllocationChart.svelte";
  import CashAllocationPreview from "./CashAllocationPreview.svelte";
  import BucketEditor from "./BucketEditor.svelte";

  let {
    positions,
    credit = 0,
    candleMap = new Map(),
    editing = false,
    oneditchange,
  }: {
    positions: EnrichedPosition[];
    credit?: number;
    candleMap?: Map<number, Candle[]>;
    editing?: boolean;
    oneditchange?: (editing: boolean) => void;
  } = $props();

  const store = createBucketStore(() => positions);
  let expandedBuckets = $state(new Set<string>());

  function toggleBucket(id: string) {
    const next = new Set(expandedBuckets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedBuckets = next;
  }
</script>

<div>
  {#if store.buckets.length === 0 && !editing}
    <div
      class="flex flex-col items-center justify-center gap-3 py-12 text-center"
    >
      <p class="text-sm text-text-secondary">
        Define target allocation buckets to compare against your current
        holdings.
      </p>
      <button
        type="button"
        class="rounded-lg bg-brand/15 px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/25"
        onclick={() => {
          store.addBucket();
          oneditchange?.(true);
        }}
      >
        Create your first bucket
      </button>
    </div>
  {:else if editing}
    <div class="flex flex-col gap-5">
      <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        {#if store.computed.some((b) => b.targetPercent > 0)}
          <TargetAllocationChart
            buckets={store.computed}
            totalTargetPercent={store.totalTargetPercent}
          />
        {/if}

        <div class="flex min-w-0 flex-1 flex-col gap-4">
          <BucketEditor {store} />

          {#if store.unassignedCount > 0}
            <p class="text-xs text-text-secondary">
              {store.unassignedCount} stock{store.unassignedCount === 1 ? "" : "s"} not assigned to
              any bucket
            </p>
          {/if}

          {#if store.buckets.length > 0 && store.totalTargetPercent !== 100}
            <p
              class="text-xs {store.totalTargetPercent > 100 ? 'text-loss' : 'text-text-secondary'}"
            >
              Target total: {pctFmt.format(store.totalTargetPercent)}%
              {#if store.totalTargetPercent !== 100}
                (should be 100%)
              {/if}
            </p>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-5">
      {#if store.computed.some((b) => b.targetPercent > 0)}
        <div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <TargetAllocationChart
            buckets={store.computed}
            totalTargetPercent={store.totalTargetPercent}
          />

          <div class="flex min-w-0 flex-1 flex-col gap-4">
            <div class="flex flex-col gap-1">
              {#each store.computed.filter((b) => b.targetPercent > 0) as bucket, i (bucket.id)}
                {@const hasSymbols = bucket.symbolDetails.length > 0}
                {@const isExpanded = expandedBuckets.has(bucket.id)}
                <button
                  type="button"
                  class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-surface-overlay/40 {hasSymbols ? 'cursor-pointer' : 'cursor-default'}"
                  onclick={() => hasSymbols && toggleBucket(bucket.id)}
                >
                  {#if hasSymbols}
                    <svg
                      class="h-3 w-3 shrink-0 text-text-secondary transition-transform duration-150"
                      class:rotate-90={isExpanded}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  {:else}
                    <span class="inline-block h-3 w-3 shrink-0"></span>
                  {/if}
                  <span
                    class="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style="background:{bucketColor(bucket, i)}"
                  ></span>
                  <span class="truncate font-medium text-text-primary">
                    {bucket.name || "Unnamed"}
                  </span>
                  <span class="ml-auto shrink-0 tabular-nums text-text-secondary">
                    {pctFmt.format(bucket.targetPercent)}%
                  </span>
                  <span class="shrink-0 tabular-nums text-text-secondary">
                    / {pctFmt.format(bucket.actualPercent)}%
                  </span>
                  <span
                    class="shrink-0 tabular-nums {Math.abs(bucket.delta) < THRESHOLD
                      ? 'text-text-secondary'
                      : bucket.delta >= 0
                        ? 'text-gain'
                        : 'text-loss'}"
                  >
                    {bucket.delta >= 0 ? "+" : ""}{pctFmt.format(bucket.delta)}%
                  </span>
                </button>
                {#if isExpanded}
                  <div class="ml-5 flex flex-col gap-0.5 border-l border-border pl-3">
                    {#each bucket.symbolDetails as sym (sym.symbol)}
                      <div class="flex items-center gap-2 py-0.5 text-[11px] text-text-secondary">
                        <span class="truncate">{sym.symbol}</span>
                        <span class="ml-auto shrink-0 tabular-nums">
                          {fmt.format(sym.marketValue)}
                        </span>
                        <span class="shrink-0 tabular-nums">
                          {pctFmt.format(sym.weight)}%
                        </span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {/each}
            </div>

            <CashAllocationPreview
              buckets={store.computed}
              totalTargetPercent={store.totalTargetPercent}
              totalAssignedMarketValue={store.totalAssignedMarketValue}
              {credit}
              {candleMap}
            />
          </div>
        </div>
      {/if}

      {#if store.unassignedCount > 0}
        <p class="text-xs text-text-secondary">
          {store.unassignedCount} stock{store.unassignedCount === 1 ? "" : "s"} not assigned to
          any bucket
        </p>
      {/if}

      {#if store.buckets.length > 0 && store.totalTargetPercent !== 100}
        <p
          class="text-xs {store.totalTargetPercent > 100 ? 'text-loss' : 'text-text-secondary'}"
        >
          Target total: {pctFmt.format(store.totalTargetPercent)}%
          {#if store.totalTargetPercent !== 100}
            (should be 100%)
          {/if}
        </p>
      {/if}
    </div>
  {/if}
</div>
