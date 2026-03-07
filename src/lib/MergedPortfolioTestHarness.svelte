<script lang="ts">
  import { createManualHoldingsStore } from "./manual-holdings.svelte";
  import { createMergedPortfolio } from "./merged-portfolio.svelte";
  import type { PortfolioData } from "./etoro-api";

  let {
    clientPortfolio = null,
    clientKeys = null,
  }: {
    clientPortfolio?: PortfolioData | null;
    clientKeys?: { apiKey: string; userKey: string } | null;
  } = $props();

  const client = {
    get keys() { return clientKeys; },
    get hasKeys() { return clientKeys !== null; },
    get portfolio() { return clientPortfolio; },
  };

  const manualStore = createManualHoldingsStore();
  const merged = createMergedPortfolio(client, manualStore);

  (window as any).__testMerged = merged;
  (window as any).__testManualStore = manualStore;
</script>

<div data-testid="harness">
  <span data-testid="filter">{merged.filter}</span>
  <span data-testid="positions-count">{merged.positions.length}</span>
</div>
