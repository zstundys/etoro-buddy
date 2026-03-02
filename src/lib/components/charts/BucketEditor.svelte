<script lang="ts">
  import ColorPicker from "../ColorPicker.svelte";
  import {
    type BucketStore,
    bucketColor,
  } from "./target-allocation.svelte.ts";

  let {
    store,
  }: {
    store: BucketStore;
  } = $props();
</script>

<div class="flex flex-col gap-4">
  {#each store.buckets as bucket, i (bucket.id)}
    <div
      class="rounded-lg border border-border bg-surface-overlay/30 p-3"
    >
      <div class="flex items-center gap-2">
        <ColorPicker
          value={bucketColor(bucket, i)}
          onchange={(c) => store.updateBucketColor(bucket.id, c)}
        />
        <input
          type="text"
          placeholder="Bucket name"
          value={bucket.name}
          oninput={(e) =>
            store.updateBucketName(
              bucket.id,
              (e.target as HTMLInputElement).value,
            )}
          class="min-w-0 flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-brand focus:outline-none"
        />
        <div class="flex items-center gap-1">
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={bucket.targetPercent}
            oninput={(e) =>
              store.updateBucketTarget(
                bucket.id,
                (e.target as HTMLInputElement).value,
              )}
            class="w-16 appearance-none rounded border border-border bg-surface-raised px-2 py-1 text-right text-sm tabular-nums text-text-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-brand focus:outline-none"
          />
          <span class="text-xs text-text-secondary">%</span>
        </div>
        <button
          type="button"
          class="rounded p-1 text-text-secondary transition-colors hover:bg-loss/15 hover:text-loss"
          onclick={() => store.removeBucket(bucket.id)}
          title="Remove bucket"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {#if store.availableSymbols.length > 0}
        <div class="mt-2">
          <select
            class="w-full rounded border border-border bg-surface-raised px-2 py-1 text-sm text-text-primary focus:border-brand focus:outline-none"
            onchange={(e) => {
              const sel = e.target as HTMLSelectElement;
              store.addSymbolToBucket(bucket.id, sel.value);
              sel.value = "";
            }}
          >
            <option value="">Add stock...</option>
            {#each store.availableSymbols as sym (sym)}
              <option value={sym}>{sym}</option>
            {/each}
          </select>
        </div>
      {/if}

      {#if bucket.symbols.length > 0}
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each bucket.symbols as sym (sym)}
            <span
              class="inline-flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-primary"
            >
              {sym}
              <button
                type="button"
                title="Remove {sym}"
                class="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-loss/20 hover:text-loss"
                onclick={() => store.removeSymbolFromBucket(bucket.id, sym)}
              >
                <svg
                  class="h-2.5 w-2.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  <button
    type="button"
    class="self-start rounded-lg bg-brand/15 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/25"
    onclick={() => store.addBucket()}
  >
    + Add bucket
  </button>
</div>
