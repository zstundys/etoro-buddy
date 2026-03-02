<script lang="ts">
  import { createClientApi } from "./client-api.svelte";

  const client = createClientApi();

  // Expose the client on the window for test access
  (window as any).__testClient = client;
</script>

<div data-testid="harness">
  <span data-testid="opportunity-source">{client.opportunitySource}</span>
  <span data-testid="watchlists-count">{client.watchlists.length}</span>
  <span data-testid="watchlist-loading">{client.watchlistLoading}</span>
  <span data-testid="has-keys">{client.hasKeys}</span>
</div>
