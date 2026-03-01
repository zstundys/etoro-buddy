<script lang="ts">
  import type { EnrichedPosition, Candle } from "$lib/etoro-api";
  import {
    percent as pctFmt,
    shortDate as dateFmt,
    monthYear as monthFmt,
    pnlColor,
    pnlSign,
    normalizeSymbol,
  } from "$lib/format";
  import DateRangeFilter from "./DateRangeFilter.svelte";
  import Money from "./Money.svelte";
  import Sparkline from "./charts/Sparkline.svelte";
  import TickerLink from "./TickerLink.svelte";

  let {
    positions,
    candleMap = new Map(),
  }: {
    positions: EnrichedPosition[];
    candleMap?: Map<number, Candle[]>;
  } = $props();

  function sparklineData(
    instrumentId: number,
  ): { date: string; value: number }[] {
    const candles = candleMap.get(instrumentId);
    if (!candles || candles.length < 2) return [];
    return candles.slice(-30).map((c) => ({ date: c.date, value: c.close }));
  }

  function posDate(p: EnrichedPosition): Date | null {
    if (!p.openDateTime) return null;
    const d = new Date(p.openDateTime);
    return isNaN(d.getTime()) ? null : d;
  }

  const dateRange = $derived.by(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const p of positions) {
      const d = posDate(p);
      if (!d) continue;
      const t = d.getTime();
      if (t < min) min = t;
      if (t > max) max = t;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (min > max) return { min: today, max: today };
    return {
      min: new Date(min),
      max: new Date(Math.max(max, today.getTime())),
    };
  });

  let filterStart = $state<Date | null>(null);
  let filterEnd = $state<Date | null>(null);

  const activeStart = $derived(filterStart ?? dateRange.min);
  const activeEnd = $derived(filterEnd ?? dateRange.max);
  const isFiltered = $derived(filterStart !== null || filterEnd !== null);

  function onFilterChange(start: Date, end: Date) {
    const sameAsMin = start.getTime() <= dateRange.min.getTime();
    const sameAsMax = end.getTime() >= dateRange.max.getTime();
    filterStart = sameAsMin ? null : start;
    filterEnd = sameAsMax ? null : end;
  }

  const filteredPositions = $derived.by(() => {
    if (!isFiltered) return positions;
    return positions.filter((p) => {
      const d = posDate(p);
      if (!d) return true;
      return d >= activeStart && d <= activeEnd;
    });
  });

  function monthKey(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key: string): string {
    const [y, m] = key.split("-");
    return monthFmt.format(new Date(Number(y), Number(m) - 1));
  }

  type SortField = "invested" | "date" | "pnl" | "pnlPct" | "fees";
  type SortDir = "asc" | "desc";

  let sortField = $state<SortField>("invested");
  let sortDir = $state<SortDir>("desc");

  function toggleSort(field: SortField) {
    if (sortField === field) {
      sortDir = sortDir === "desc" ? "asc" : "desc";
    } else {
      sortField = field;
      sortDir = "desc";
    }
  }

  const sortOptions: { field: SortField; label: string }[] = [
    { field: "invested", label: "Invested" },
    { field: "date", label: "Date" },
    { field: "pnl", label: "P&L" },
    { field: "pnlPct", label: "P&L %" },
    { field: "fees", label: "Fees" },
  ];

  type MonthGroup = {
    key: string;
    positions: EnrichedPosition[];
    totalAmount: number;
    totalPnl: number;
    totalFees: number;
  };
  type SymbolGroup = {
    symbol: string;
    displayName?: string;
    logoUrl?: string;
    months: MonthGroup[];
    totalAmount: number;
    totalPnl: number;
    totalFees: number;
    positionCount: number;
    earliestDate: string;
  };

  function posValue(p: EnrichedPosition, field: SortField): number {
    switch (field) {
      case "invested":
        return p.amount;
      case "date":
        return new Date(p.openDateTime).getTime();
      case "pnl":
        return p.pnl ?? 0;
      case "pnlPct":
        return p.pnlPercent ?? 0;
      case "fees":
        return Math.abs(p.totalFees);
    }
  }

  function monthValue(m: MonthGroup, field: SortField): number | string {
    switch (field) {
      case "invested":
        return m.totalAmount;
      case "date":
        return m.key;
      case "pnl":
        return m.totalPnl;
      case "pnlPct":
        return m.totalAmount > 0 ? m.totalPnl / m.totalAmount : 0;
      case "fees":
        return Math.abs(m.totalFees);
    }
  }

  function groupValue(g: SymbolGroup, field: SortField): number | string {
    switch (field) {
      case "invested":
        return g.totalAmount;
      case "date":
        return g.earliestDate;
      case "pnl":
        return g.totalPnl;
      case "pnlPct":
        return g.totalAmount > 0 ? g.totalPnl / g.totalAmount : 0;
      case "fees":
        return Math.abs(g.totalFees);
    }
  }

  function cmp(
    a: number | string,
    b: number | string,
    dir: SortDir,
    zeroIsEmpty = false,
  ): number {
    if (zeroIsEmpty) {
      const aEmpty = a === 0 || a === "";
      const bEmpty = b === 0 || b === "";
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    }
    const d = dir === "desc" ? -1 : 1;
    if (typeof a === "string" && typeof b === "string")
      return a.localeCompare(b) * d;
    return ((a as number) - (b as number)) * d;
  }

  function groupPositions(
    items: EnrichedPosition[],
    sf: SortField,
    sd: SortDir,
  ): SymbolGroup[] {
    const bySymbol = new Map<string, EnrichedPosition[]>();
    for (const pos of items) {
      const raw = pos.symbol ?? `#${pos.instrumentId}`;
      const key = normalizeSymbol(raw);
      if (!bySymbol.has(key)) bySymbol.set(key, []);
      bySymbol.get(key)!.push(pos);
    }

    const emptyLast = sf === "fees";
    const groups: SymbolGroup[] = [];
    for (const [symbol, symbolPositions] of bySymbol) {
      const byMonth = new Map<string, EnrichedPosition[]>();
      for (const pos of symbolPositions) {
        const mk = monthKey(pos.openDateTime);
        if (!byMonth.has(mk)) byMonth.set(mk, []);
        byMonth.get(mk)!.push(pos);
      }

      const months: MonthGroup[] = [...byMonth.entries()]
        .map(([key, pos]) => ({
          key,
          positions: pos.sort((a, b) =>
            cmp(posValue(a, sf), posValue(b, sf), sd, emptyLast),
          ),
          totalAmount: pos.reduce((s, p) => s + p.amount, 0),
          totalPnl: pos.reduce((s, p) => s + (p.pnl ?? 0), 0),
          totalFees: pos.reduce((s, p) => s + p.totalFees, 0),
        }))
        .sort((a, b) =>
          cmp(monthValue(a, sf), monthValue(b, sf), sd, emptyLast),
        );

      let earliest = "";
      for (const p of symbolPositions) {
        if (!earliest || p.openDateTime < earliest) earliest = p.openDateTime;
      }

      groups.push({
        symbol,
        displayName: symbolPositions[0]?.displayName,
        logoUrl: symbolPositions.find((p) => p.logoUrl)?.logoUrl,
        months,
        totalAmount: symbolPositions.reduce((s, p) => s + p.amount, 0),
        totalPnl: symbolPositions.reduce((s, p) => s + (p.pnl ?? 0), 0),
        totalFees: symbolPositions.reduce((s, p) => s + p.totalFees, 0),
        positionCount: symbolPositions.length,
        earliestDate: earliest,
      });
    }

    return groups.sort((a, b) =>
      cmp(groupValue(a, sf), groupValue(b, sf), sd, emptyLast),
    );
  }

  const grouped = $derived(
    groupPositions(filteredPositions, sortField, sortDir),
  );

  type DateMonthGroup = {
    key: string;
    positions: EnrichedPosition[];
    totalAmount: number;
    totalPnl: number;
    totalFees: number;
  };

  function groupByDate(
    items: EnrichedPosition[],
    sd: SortDir,
  ): DateMonthGroup[] {
    const byMonth = new Map<string, EnrichedPosition[]>();
    for (const pos of items) {
      const mk = monthKey(pos.openDateTime);
      if (!byMonth.has(mk)) byMonth.set(mk, []);
      byMonth.get(mk)!.push(pos);
    }

    return [...byMonth.entries()]
      .map(([key, pos]) => ({
        key,
        positions: pos.sort((a, b) =>
          cmp(posValue(a, "date"), posValue(b, "date"), sd),
        ),
        totalAmount: pos.reduce((s, p) => s + p.amount, 0),
        totalPnl: pos.reduce((s, p) => s + (p.pnl ?? 0), 0),
        totalFees: pos.reduce((s, p) => s + p.totalFees, 0),
      }))
      .sort((a, b) => cmp(a.key, b.key, sd));
  }

  const dateGrouped = $derived(groupByDate(filteredPositions, sortDir));
  const isByDate = $derived(sortField === "date");

  let expandedSymbols = $state<Set<string>>(new Set());
  let expandedMonths = $state<Set<string>>(new Set());

  function toggleSymbol(symbol: string) {
    const next = new Set(expandedSymbols);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    expandedSymbols = next;
  }

  function toggleMonth(symbol: string, mk: string) {
    const key = `${symbol}::${mk}`;
    const next = new Set(expandedMonths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedMonths = next;
  }

  function expandAll() {
    if (isByDate) {
      const months = new Set<string>();
      for (const m of dateGrouped) months.add(`date::${m.key}`);
      expandedMonths = months;
    } else {
      const symbols = new Set<string>();
      const months = new Set<string>();
      for (const g of grouped) {
        symbols.add(g.symbol);
        for (const m of g.months) months.add(`${g.symbol}::${m.key}`);
      }
      expandedSymbols = symbols;
      expandedMonths = months;
    }
  }

  function collapseAll() {
    expandedSymbols = new Set();
    expandedMonths = new Set();
  }
</script>

<section>
  {#if positions.length === 0}
    <div
      class="rounded-xl border border-border bg-surface-raised px-8 py-16 text-center"
    >
      <p class="text-lg text-text-secondary">No open positions</p>
    </div>
  {:else}
    <h2 class="mb-3 text-lg font-semibold text-text-primary">Positions</h2>
    <div class="mb-4">
      <DateRangeFilter
        minDate={dateRange.min}
        maxDate={dateRange.max}
        startDate={activeStart}
        endDate={activeEnd}
        onchange={onFilterChange}
      />
      {#if isFiltered}
        {@const fInvested = filteredPositions.reduce((s, p) => s + p.amount, 0)}
        {@const fPnl = filteredPositions.reduce((s, p) => s + (p.pnl ?? 0), 0)}
        {@const fFees = filteredPositions.reduce((s, p) => s + p.totalFees, 0)}
        {@const fPnlPct = fInvested > 0 ? (fPnl / fInvested) * 100 : 0}
        {@const rangeDays = Math.round(
          (activeEnd.getTime() - activeStart.getTime()) / 86_400_000,
        )}
        <div
          class="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-brand/20 bg-brand/5 px-4 py-2 text-xs"
        >
          <span class="text-text-secondary"
            >Filtered range <span class="ml-1 font-medium text-text-primary"
              >{rangeDays} day{rangeDays !== 1 ? "s" : ""}</span
            ></span
          >
          <span class="flex-1"></span>
          <span
            >Fees / Div
            {#if fFees !== 0}
              <Money
                value={fFees}
                abs
                signOverride={fFees < 0 ? "+" : ""}
                class="font-medium {fFees < 0 ? 'text-gain' : 'text-loss'}"
              />
            {:else}
              <span class="font-medium">—</span>
            {/if}
          </span>
          <span>Invested <Money value={fInvested} class="font-medium" /></span>
          <span
            >P&L
            <Money value={fPnl} showSign class="font-medium" />
          </span>
          <span
            >P&L %
            <span class="font-medium {pnlColor(fPnlPct)}">
              {pnlSign(fPnlPct)}{pctFmt.format(fPnlPct)}%
            </span>
          </span>
        </div>
      {/if}
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <p class="text-sm text-text-secondary">
        {#if isByDate}
          {#if isFiltered}
            {filteredPositions.length} of {positions.length} position{positions.length !==
            1
              ? "s"
              : ""} across {dateGrouped.length} month{dateGrouped.length !== 1
              ? "s"
              : ""}
          {:else}
            {positions.length} position{positions.length !== 1 ? "s" : ""} across
            {dateGrouped.length}
            month{dateGrouped.length !== 1 ? "s" : ""}
          {/if}
        {:else if isFiltered}
          {filteredPositions.length} of {positions.length} position{positions.length !==
          1
            ? "s"
            : ""} across {grouped.length} asset{grouped.length !== 1 ? "s" : ""}
        {:else}
          {positions.length} position{positions.length !== 1 ? "s" : ""} across {grouped.length}
          asset{grouped.length !== 1 ? "s" : ""}
        {/if}
      </p>
      <div class="ml-auto flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1">
          {#each sortOptions as opt (opt.field)}
            <button
              onclick={() => toggleSort(opt.field)}
              class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {sortField ===
              opt.field
                ? 'bg-surface-overlay text-text-primary'
                : 'text-text-secondary hover:text-text-primary'}"
            >
              {opt.label}
              {#if sortField === opt.field}
                <span class="ml-0.5 text-[9px]"
                  >{sortDir === "desc" ? "▼" : "▲"}</span
                >
              {/if}
            </button>
          {/each}
        </div>
        <div class="flex gap-2">
          <button
            onclick={expandAll}
            class="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            Expand all
          </button>
          <button
            onclick={collapseAll}
            class="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            Collapse all
          </button>
        </div>
      </div>
    </div>

    {#if isFiltered && filteredPositions.length === 0}
      <div
        class="rounded-xl border border-border bg-surface-raised px-8 py-12 text-center"
      >
        <p class="text-sm text-text-secondary">
          No positions in the selected date range
        </p>
      </div>
    {:else if isByDate}
      <div class="overflow-x-auto">
        <div
          class="min-w-fit grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto_auto_auto_auto] gap-y-2"
        >
          <div
            class="col-span-full grid grid-cols-subgrid h-0 min-h-0 overflow-hidden"
            aria-hidden="true"
          >
            <div class="pl-5 pr-3 text-xs">Jan 00, 0000</div>
            <div class="px-3 text-xs">TICKER</div>
            <div class="px-3 text-xs">SELL</div>
            <div class="px-3 text-right text-xs tabular-nums">$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">00.0000</div>
            <div class="px-3 text-right text-xs tabular-nums">$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">+$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">+$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">+00.00%</div>
            <div class="px-3 pr-5 text-right text-xs tabular-nums">
              $0,000.00
            </div>
          </div>
          {#each dateGrouped as month (month.key)}
            {@const monthId = `date::${month.key}`}
            {@const monthExpanded = expandedMonths.has(monthId)}
            {@const monthPnlPercent =
              month.totalAmount > 0
                ? (month.totalPnl / month.totalAmount) * 100
                : 0}
            <div
              class="col-span-full grid grid-cols-subgrid overflow-hidden rounded-xl border border-border bg-surface-raised"
            >
              <button
                onclick={() => {
                  const next = new Set(expandedMonths);
                  if (next.has(monthId)) next.delete(monthId);
                  else next.add(monthId);
                  expandedMonths = next;
                }}
                class="col-span-full grid grid-cols-subgrid items-center py-3.5 text-left transition-colors hover:bg-surface-overlay/50"
              >
                <div class="col-span-3 flex items-center gap-3 pl-5 pr-3">
                  <svg
                    class="h-4 w-4 shrink-0 text-text-secondary transition-transform {monthExpanded
                      ? 'rotate-90'
                      : ''}"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M9 18l6-6-6-6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span class="text-sm font-semibold"
                    >{monthLabel(month.key)}</span
                  >
                  <span
                    class="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {month.positions.length}
                  </span>
                </div>
                <div class="whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">Invested</p>
                  <p class="font-medium"><Money value={month.totalAmount} /></p>
                </div>
                <div class="col-span-3"></div>
                <div class="min-w-24 whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">Fees / Div</p>
                  {#if month.totalFees !== 0}
                    <p class="font-medium">
                      <Money
                        value={month.totalFees}
                        abs
                        signOverride={month.totalFees < 0 ? "+" : ""}
                        class={month.totalFees < 0 ? "text-gain" : "text-loss"}
                      />
                    </p>
                  {:else}
                    <p class="font-medium text-text-secondary">—</p>
                  {/if}
                </div>
                <div class="min-w-24 whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">P&L</p>
                  <p class="font-medium">
                    <Money value={month.totalPnl} showSign />
                  </p>
                </div>
                <div class="min-w-24 whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">P&L %</p>
                  <p class="font-medium {pnlColor(monthPnlPercent)}">
                    {pnlSign(monthPnlPercent)}{pctFmt.format(monthPnlPercent)}%
                  </p>
                </div>
                <div
                  class="min-w-24 whitespace-nowrap pl-4 pr-5 text-right text-sm"
                >
                  <p class="text-xs text-text-secondary">Total</p>
                  <p class="font-medium">
                    <Money value={month.totalAmount + month.totalPnl} />
                  </p>
                </div>
              </button>

              {#if monthExpanded}
                <div
                  class="col-span-full grid grid-cols-subgrid border-t border-border bg-black/20 text-xs"
                >
                  <div
                    class="col-span-full grid grid-cols-subgrid border-b border-border/30 text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                  >
                    <div class="py-2 pl-5 pr-3">Date</div>
                    <div class="px-3 py-2">Ticker</div>
                    <div class="px-3 py-2">Side</div>
                    <div class="px-3 py-2 text-right">Amount</div>
                    <div class="px-3 py-2 text-right">Units</div>
                    <div class="px-3 py-2 text-right">Open Price</div>
                    <div class="px-3 py-2 text-right">Current</div>
                    <div class="px-3 py-2 text-right">Fees / Div</div>
                    <div class="px-3 py-2 text-right">P&L</div>
                    <div class="px-3 py-2 text-right">P&L %</div>
                    <div class="px-3 py-2 pr-5 text-right">Total</div>
                  </div>
                  {#each month.positions as pos, i (pos.positionId || i)}
                    {@const sym = normalizeSymbol(
                      pos.symbol ?? `#${pos.instrumentId}`,
                    )}
                    {@const sd = sparklineData(pos.instrumentId)}
                    <div
                      class="col-span-full grid grid-cols-subgrid border-b border-border/20 last:border-b-0 transition-colors hover:bg-surface-overlay/20"
                    >
                      <div
                        class="whitespace-nowrap py-2 pl-5 pr-3 text-text-secondary"
                      >
                        {dateFmt.format(new Date(pos.openDateTime))}
                      </div>
                      <div class="px-3 py-2">
                        <div class="flex items-center gap-2">
                          {#if pos.logoUrl}
                            <img
                              src={pos.logoUrl}
                              alt={sym}
                              class="h-5 w-5 shrink-0 rounded-full"
                            />
                          {:else}
                            <div
                              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[8px] font-bold text-text-secondary"
                            >
                              {sym.slice(0, 2)}
                            </div>
                          {/if}
                          <TickerLink symbol={sym} class="font-medium" />
                        </div>
                      </div>
                      <div class="px-3 py-2">
                        <span
                          class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium {pos.isBuy
                            ? 'bg-gain/15 text-gain'
                            : 'bg-loss/15 text-loss'}"
                        >
                          {pos.isBuy ? "BUY" : "SELL"}
                        </span>
                      </div>
                      <div
                        class="relative flex items-center gap-2 px-3 py-2 text-right font-medium"
                      >
                        <Money value={pos.amount} />
                        {#if sd.length >= 2}
                          <span class="hidden sm:inline-block"
                            ><Sparkline
                              data={sd}
                              width={64}
                              height={20}
                            /></span
                          >
                        {/if}
                      </div>
                      <div
                        class="px-3 py-2 text-right tabular-nums text-text-secondary"
                      >
                        <span data-private>{pos.units.toFixed(4)}</span>
                      </div>
                      <div class="px-3 py-2 text-right tabular-nums">
                        <Money value={pos.openRate} public />
                      </div>
                      <div class="px-3 py-2 text-right tabular-nums">
                        {#if pos.currentRate !== undefined}
                          <Money value={pos.currentRate} public />
                        {:else}
                          —
                        {/if}
                      </div>
                      <div class="px-3 py-2 text-right tabular-nums">
                        {#if pos.totalFees !== 0}
                          <Money
                            value={pos.totalFees}
                            abs
                            signOverride={pos.totalFees < 0 ? "+" : ""}
                            class={pos.totalFees < 0
                              ? "text-gain"
                              : pos.totalFees > 0
                                ? "text-loss"
                                : ""}
                          />
                        {:else}
                          <span class="text-text-secondary">—</span>
                        {/if}
                      </div>
                      <div
                        class="px-3 py-2 text-right tabular-nums font-medium"
                      >
                        {#if pos.pnl !== undefined}
                          <Money value={pos.pnl} showSign />
                        {:else}
                          <span class={pnlColor(pos.pnl)}>—</span>
                        {/if}
                      </div>
                      <div
                        class="px-3 py-2 text-right tabular-nums {pnlColor(
                          pos.pnlPercent,
                        )}"
                      >
                        {pos.pnlPercent !== undefined
                          ? `${pnlSign(pos.pnlPercent)}${pctFmt.format(pos.pnlPercent)}%`
                          : "—"}
                      </div>
                      <div
                        class="px-3 py-2 pr-5 text-right tabular-nums font-medium"
                      >
                        <Money value={pos.amount + (pos.pnl ?? 0)} />
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <div
          class="min-w-fit grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto_auto_auto] gap-y-2"
        >
          <div
            class="col-span-full grid grid-cols-subgrid h-0 min-h-0 overflow-hidden"
            aria-hidden="true"
          >
            <div class="pl-16 pr-3 text-xs">Jan 00, 0000</div>
            <div class="px-3 text-xs">SELL</div>
            <div class="px-3 text-right text-xs tabular-nums">$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">00.0000</div>
            <div class="px-3 text-right text-xs tabular-nums">$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">+$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">+$0,000.00</div>
            <div class="px-3 text-right text-xs tabular-nums">+00.00%</div>
            <div class="px-3 pr-5 text-right text-xs tabular-nums">
              $0,000.00
            </div>
          </div>
          {#each grouped as group (group.symbol)}
            {@const symbolExpanded = expandedSymbols.has(group.symbol)}
            {@const groupPnlPercent =
              group.totalAmount > 0
                ? (group.totalPnl / group.totalAmount) * 100
                : 0}
            {@const groupSparkline = sparklineData(
              group.months[0]?.positions[0]?.instrumentId ?? 0,
            )}
            <div
              class="col-span-full grid grid-cols-subgrid overflow-hidden rounded-xl border border-border bg-surface-raised"
            >
              <button
                onclick={() => toggleSymbol(group.symbol)}
                class="col-span-full grid grid-cols-subgrid items-center py-3.5 text-left transition-colors hover:bg-surface-overlay/50"
              >
                <div class="col-span-2 flex items-center gap-3 pl-5 pr-3">
                  <svg
                    class="h-4 w-4 shrink-0 text-text-secondary transition-transform {symbolExpanded
                      ? 'rotate-90'
                      : ''}"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M9 18l6-6-6-6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  {#if group.logoUrl}
                    <img
                      src={group.logoUrl}
                      alt={group.symbol}
                      class="h-7 w-7 shrink-0 rounded-full"
                    />
                  {:else}
                    <div
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[10px] font-bold text-text-secondary"
                    >
                      {group.symbol.slice(0, 2)}
                    </div>
                  {/if}
                  <div
                    class="w-max leading-tight overflow-clip flex gap-x-1 items-baseline flex-wrap min-w-[8ch]"
                  >
                    <TickerLink
                      symbol={group.symbol}
                      class="text-sm font-semibold"
                    />

                    <div class="flex items-baseline gap-x-1 min-w-0">
                      {#if group.displayName}
                        <span
                          class=" text-xs text-text-secondary whitespace-nowrap text-ellipsis overflow-hidden"
                          >{group.displayName}</span
                        >
                      {/if}
                      <span
                        class="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
                      >
                        {group.positionCount}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">Invested</p>
                  <p class="font-medium"><Money value={group.totalAmount} /></p>
                </div>
                {#if groupSparkline.length >= 2}
                  <div
                    class="relative hidden items-center px-2 sm:flex col-span-3 justify-center"
                  >
                    <Sparkline data={groupSparkline} width={120} height={28} />
                  </div>
                {:else}
                  <div class="col-span-3"></div>
                {/if}
                <div class="min-w-24 whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">Fees / Div</p>
                  {#if group.totalFees !== 0}
                    <p class="font-medium">
                      <Money
                        value={group.totalFees}
                        abs
                        signOverride={group.totalFees < 0 ? "+" : ""}
                        class={group.totalFees < 0 ? "text-gain" : "text-loss"}
                      />
                    </p>
                  {:else}
                    <p class="font-medium text-text-secondary">—</p>
                  {/if}
                </div>
                <div class="min-w-24 whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">P&L</p>
                  <p class="font-medium">
                    <Money value={group.totalPnl} showSign />
                  </p>
                </div>
                <div class="min-w-24 whitespace-nowrap px-4 text-right text-sm">
                  <p class="text-xs text-text-secondary">P&L %</p>
                  <p class="font-medium {pnlColor(groupPnlPercent)}">
                    {pnlSign(groupPnlPercent)}{pctFmt.format(groupPnlPercent)}%
                  </p>
                </div>
                <div
                  class="min-w-24 whitespace-nowrap pl-4 pr-5 text-right text-sm"
                >
                  <p class="text-xs text-text-secondary">Total</p>
                  <p class="font-medium">
                    <Money value={group.totalAmount + group.totalPnl} />
                  </p>
                </div>
              </button>

              {#if symbolExpanded}
                <div
                  class="col-span-full grid grid-cols-subgrid border-t border-border"
                >
                  {#each group.months as month (month.key)}
                    {@const monthExpanded = expandedMonths.has(
                      `${group.symbol}::${month.key}`,
                    )}
                    {@const monthPnlPercent =
                      month.totalAmount > 0
                        ? (month.totalPnl / month.totalAmount) * 100
                        : 0}
                    <div
                      class="col-span-full grid grid-cols-subgrid border-b border-border/50 last:border-b-0"
                    >
                      <button
                        onclick={() => toggleMonth(group.symbol, month.key)}
                        class="col-span-full grid grid-cols-subgrid items-center py-2.5 text-left transition-colors hover:bg-surface-overlay/30"
                      >
                        <div
                          class="col-span-2 flex items-center gap-3 pl-10 pr-3"
                        >
                          <svg
                            class="h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform {monthExpanded
                              ? 'rotate-90'
                              : ''}"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                          >
                            <path
                              d="M9 18l6-6-6-6"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                          <span
                            class="whitespace-nowrap text-xs font-medium text-text-secondary"
                            >{monthLabel(month.key)}
                            <span
                              class="ml-1 rounded-full bg-surface-overlay px-2 py-0.5 text-[10px]"
                              >{month.positions.length}</span
                            >
                          </span>
                        </div>
                        <div class="whitespace-nowrap px-4 text-right text-xs">
                          <Money value={month.totalAmount} />
                        </div>
                        <div class="col-span-3"></div>
                        <div
                          class="min-w-24 whitespace-nowrap px-4 text-right text-xs"
                        >
                          {#if month.totalFees !== 0}
                            <Money
                              value={month.totalFees}
                              abs
                              signOverride={month.totalFees < 0 ? "+" : ""}
                              class={month.totalFees < 0
                                ? "text-gain"
                                : "text-loss"}
                            />
                          {:else}
                            <span class="text-text-secondary">—</span>
                          {/if}
                        </div>
                        <div
                          class="min-w-24 whitespace-nowrap px-4 text-right text-xs"
                        >
                          <Money value={month.totalPnl} showSign />
                        </div>
                        <div
                          class="min-w-24 whitespace-nowrap px-4 text-right text-xs {pnlColor(
                            monthPnlPercent,
                          )}"
                        >
                          {pnlSign(monthPnlPercent)}{pctFmt.format(
                            monthPnlPercent,
                          )}%
                        </div>
                        <div
                          class="min-w-24 whitespace-nowrap pl-4 pr-5 text-right text-xs font-medium"
                        >
                          <Money value={month.totalAmount + month.totalPnl} />
                        </div>
                      </button>

                      {#if monthExpanded}
                        <div
                          class="col-span-full grid grid-cols-subgrid bg-black/20 text-xs"
                        >
                          <div
                            class="col-span-full grid grid-cols-subgrid border-b border-border/30 text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                          >
                            <div class="py-2 pl-16 pr-3">Date</div>
                            <div class="px-3 py-2">Side</div>
                            <div class="px-3 py-2 text-right">Amount</div>
                            <div class="px-3 py-2 text-right">Units</div>
                            <div class="px-3 py-2 text-right">Open Price</div>
                            <div class="px-3 py-2 text-right">Current</div>
                            <div class="px-3 py-2 text-right">Fees / Div</div>
                            <div class="px-3 py-2 text-right">P&L</div>
                            <div class="px-3 py-2 text-right">P&L %</div>
                            <div class="px-3 py-2 pr-5 text-right">Total</div>
                          </div>
                          {#each month.positions as pos, i (pos.positionId || i)}
                            <div
                              class="col-span-full grid grid-cols-subgrid border-b border-border/20 last:border-b-0 transition-colors hover:bg-surface-overlay/20"
                            >
                              <div
                                class="whitespace-nowrap py-2 pl-16 pr-3 text-text-secondary"
                              >
                                {dateFmt.format(new Date(pos.openDateTime))}
                              </div>
                              <div class="px-3 py-2">
                                <span
                                  class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium {pos.isBuy
                                    ? 'bg-gain/15 text-gain'
                                    : 'bg-loss/15 text-loss'}"
                                >
                                  {pos.isBuy ? "BUY" : "SELL"}
                                </span>
                              </div>
                              <div class="px-3 py-2 text-right font-medium">
                                <Money value={pos.amount} />
                              </div>
                              <div
                                class="px-3 py-2 text-right tabular-nums text-text-secondary"
                              >
                                <span data-private>{pos.units.toFixed(4)}</span>
                              </div>
                              <div class="px-3 py-2 text-right tabular-nums">
                                <Money value={pos.openRate} public />
                              </div>
                              <div class="px-3 py-2 text-right tabular-nums">
                                {#if pos.currentRate !== undefined}
                                  <Money value={pos.currentRate} public />
                                {:else}
                                  —
                                {/if}
                              </div>
                              <div class="px-3 py-2 text-right tabular-nums">
                                {#if pos.totalFees !== 0}
                                  <Money
                                    value={pos.totalFees}
                                    abs
                                    signOverride={pos.totalFees < 0 ? "+" : ""}
                                    class={pos.totalFees < 0
                                      ? "text-gain"
                                      : pos.totalFees > 0
                                        ? "text-loss"
                                        : ""}
                                  />
                                {:else}
                                  <span class="text-text-secondary">—</span>
                                {/if}
                              </div>
                              <div
                                class="px-3 py-2 text-right tabular-nums font-medium"
                              >
                                {#if pos.pnl !== undefined}
                                  <Money value={pos.pnl} showSign />
                                {:else}
                                  <span class={pnlColor(pos.pnl)}>—</span>
                                {/if}
                              </div>
                              <div
                                class="px-3 py-2 text-right tabular-nums {pnlColor(
                                  pos.pnlPercent,
                                )}"
                              >
                                {pos.pnlPercent !== undefined
                                  ? `${pnlSign(pos.pnlPercent)}${pctFmt.format(pos.pnlPercent)}%`
                                  : "—"}
                              </div>
                              <div
                                class="px-3 py-2 pr-5 text-right tabular-nums font-medium"
                              >
                                <Money value={pos.amount + (pos.pnl ?? 0)} />
                              </div>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>
