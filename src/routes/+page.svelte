<script lang="ts">
  import PortfolioSummary from "$lib/components/PortfolioSummary.svelte";
  import PositionsTable from "$lib/components/PositionsTable.svelte";
  import BuyingOpportunities from "$lib/components/BuyingOpportunities.svelte";
  import RecentTrades from "$lib/components/RecentTrades.svelte";
  import ChartsDashboard from "$lib/components/charts/ChartsDashboard.svelte";
  import { getAppContext } from "$lib/app-context";
  import type {
    PortfolioData,
    EnrichedTrade,
    Candle,
    InstrumentSnapshot,
  } from "$lib/etoro-api";

  let { data } = $props();

  const { client, manualStore, merged } = getAppContext();

  const useClientData = $derived(client.hasKeys && client.portfolio !== null);

  const portfolio = $derived<PortfolioData | null>(
    useClientData || manualStore.holdings.length > 0
      ? merged.portfolio
      : data.portfolio,
  );

  const trades = $derived<EnrichedTrade[]>(
    useClientData ? client.trades : data.recentTrades,
  );

  const candleMap = $derived.by<Map<number, Candle[]>>(() => {
    const map = new Map(client.candles);
    for (const [id, candles] of merged.candles) {
      if (!map.has(id)) map.set(id, candles);
    }
    return map;
  });

  const activeError = $derived(client.hasKeys ? client.error : data.error);

  const hasData = $derived(
    portfolio !== null && portfolio.positions.length > 0,
  );

  const sectorMap = $derived<Map<number, string>>(client.sectorMap);

  const opportunityInstruments = $derived<InstrumentSnapshot[]>(
    client.opportunitySource === "portfolio"
      ? (portfolio?.positions ?? [])
      : client.watchlistInstruments,
  );

  const opportunityCandleMap = $derived<Map<number, Candle[]>>(
    client.opportunitySource === "portfolio"
      ? candleMap
      : client.watchlistCandles,
  );

  type PositionMarker = { date: string; label?: string; price?: number; units?: number; amount?: number };

  const positionDates = $derived.by(() => {
    const map = new Map<number, PositionMarker[]>();
    if (!portfolio) return map;
    for (const p of portfolio.positions) {
      const marker: PositionMarker = {
        date: p.openDateTime,
        label: p.isBuy ? "BUY" : "SELL",
        price: p.openRate,
        units: p.units,
        amount: p.amount,
      };
      const arr = map.get(p.instrumentId);
      if (arr) arr.push(marker);
      else map.set(p.instrumentId, [marker]);
    }
    return map;
  });

  $effect(() => {
    if (
      client.portfolio &&
      client.portfolio.positions.length > 0 &&
      client.candles.size === 0 &&
      !client.candlesLoading
    ) {
      client.loadCandles();
    }
  });

  $effect(() => {
    if (client.portfolio && client.portfolio.positions.length > 0) {
      client.loadSectorMap();
      client.loadWatchlists();
    }
  });
</script>

{#if activeError}
  <div
    class="rounded-xl border border-loss/30 bg-loss/10 px-5 py-4 text-sm text-loss"
  >
    {activeError}
  </div>
{/if}

{#if client.loading}
  <div
    class="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface-raised px-8 py-16"
  >
    <div
      class="h-8 w-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
    ></div>
    <p class="text-sm text-text-secondary">Loading portfolio...</p>
  </div>
{:else if hasData && portfolio}
  <div class="grid gap-y-10 *:min-w-0">
    <PortfolioSummary {portfolio} />
    <BuyingOpportunities
      instruments={opportunityInstruments}
      candleMap={opportunityCandleMap}
      watchlists={client.watchlists}
      selectedSource={client.opportunitySource}
      watchlistLoading={client.watchlistLoading}
      onSourceChange={client.setOpportunitySource}
      {positionDates}
    />
    <RecentTrades {trades} positions={portfolio.positions} pendingOrders={portfolio.pendingOrders} />
    <PositionsTable positions={portfolio.positions} {candleMap} />
    <ChartsDashboard
      positions={portfolio.positions}
      {trades}
      {candleMap}
      availableCash={portfolio.availableCash}
      {sectorMap}
    />
  </div>
{/if}
