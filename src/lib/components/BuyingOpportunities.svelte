<script lang="ts">
  import type { EnrichedPosition, Candle } from "$lib/etoro-api";
  import {
    percent as pctFmt,
    pnlColor,
    pnlSign,
    normalizeSymbol,
  } from "$lib/format";

  let {
    positions,
    candleMap = new Map(),
  }: {
    positions: EnrichedPosition[];
    candleMap?: Map<number, Candle[]>;
  } = $props();

  type OpportunityRow = {
    instrumentId: number;
    symbol: string;
    displayName?: string;
    logoUrl?: string;
    currentPrice: number;
    change1D?: number;
    change7D?: number;
    change1M?: number;
    change3M?: number;
    change6M?: number;
    changeYTD?: number;
    diff200MA?: number;
  };

  function findCandleByDate(
    candles: Candle[],
    targetDate: Date,
  ): Candle | undefined {
    const target = targetDate.getTime();
    let best: Candle | undefined;
    let bestDist = Infinity;
    for (const c of candles) {
      const d = new Date(c.date).getTime();
      if (d > target) break;
      const dist = Math.abs(d - target);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }

  function pctChange(current: number, previous: number): number {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  function sma(candles: Candle[], period: number): number | undefined {
    if (candles.length < period) return undefined;
    const slice = candles.slice(-period);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);
    return sum / period;
  }

  type SortColumn =
    | "1d"
    | "7d"
    | "1m"
    | "3m"
    | "6m"
    | "ytd"
    | "200ma"
    | "symbol";
  type SortDir = "asc" | "desc";

  let sortCol = $state<SortColumn>("200ma");
  let sortDir = $state<SortDir>("asc");

  function toggleSort(col: SortColumn) {
    if (sortCol === col) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortCol = col;
      sortDir = "asc";
    }
  }

  function sortValue(row: OpportunityRow, col: SortColumn): number | string {
    switch (col) {
      case "symbol":
        return row.symbol;
      case "1d":
        return row.change1D ?? Infinity;
      case "7d":
        return row.change7D ?? Infinity;
      case "1m":
        return row.change1M ?? Infinity;
      case "3m":
        return row.change3M ?? Infinity;
      case "6m":
        return row.change6M ?? Infinity;
      case "ytd":
        return row.changeYTD ?? Infinity;
      case "200ma":
        return row.diff200MA ?? Infinity;
    }
  }

  function baseTicker(symbol: string): string {
    return normalizeSymbol(symbol).split(".")[0];
  }

  const rows = $derived.by<OpportunityRow[]>(() => {
    const groups = new Map<
      string,
      { pos: EnrichedPosition; candles: Candle[] }
    >();
    for (const p of positions) {
      const ticker = baseTicker(p.symbol ?? `#${p.instrumentId}`);
      const candles = candleMap.get(p.instrumentId) ?? [];
      const existing = groups.get(ticker);
      if (!existing || candles.length > existing.candles.length) {
        groups.set(ticker, { pos: p, candles });
      }
    }

    const now = new Date();
    const d1 = new Date(now);
    d1.setDate(d1.getDate() - 1);
    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 7);
    const m1 = new Date(now);
    m1.setMonth(m1.getMonth() - 1);
    const m3 = new Date(now);
    m3.setMonth(m3.getMonth() - 3);
    const m6 = new Date(now);
    m6.setMonth(m6.getMonth() - 6);
    const ytdStart = new Date(now.getFullYear(), 0, 1);

    const result: OpportunityRow[] = [];

    for (const [ticker, { pos, candles }] of groups) {
      if (candles.length < 2) continue;

      const latest = candles[candles.length - 1];
      const currentPrice = pos.currentRate ?? latest.close;

      const c1d = findCandleByDate(candles, d1);
      const c7d = findCandleByDate(candles, d7);
      const c1m = findCandleByDate(candles, m1);
      const c3m = findCandleByDate(candles, m3);
      const c6m = findCandleByDate(candles, m6);
      const cYtd = findCandleByDate(candles, ytdStart);
      const ma200 = sma(candles, 200);

      result.push({
        instrumentId: pos.instrumentId,
        symbol: ticker,
        displayName: pos.displayName,
        logoUrl: pos.logoUrl,
        currentPrice,
        change1D: c1d ? pctChange(currentPrice, c1d.close) : undefined,
        change7D: c7d ? pctChange(currentPrice, c7d.close) : undefined,
        change1M: c1m ? pctChange(currentPrice, c1m.close) : undefined,
        change3M: c3m ? pctChange(currentPrice, c3m.close) : undefined,
        change6M: c6m ? pctChange(currentPrice, c6m.close) : undefined,
        changeYTD: cYtd ? pctChange(currentPrice, cYtd.close) : undefined,
        diff200MA: ma200 ? pctChange(currentPrice, ma200) : undefined,
      });
    }

    return result;
  });

  const sortedRows = $derived.by(() => {
    const col = sortCol;
    const dir = sortDir;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, col);
      const vb = sortValue(b, col);
      if (typeof va === "string" && typeof vb === "string") {
        return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const d = dir === "asc" ? 1 : -1;
      return ((va as number) - (vb as number)) * d;
    });
  });

  function cellColor(value: number | undefined): string {
    if (value === undefined) return "";
    if (value <= -20) return "bg-loss/25 text-loss";
    if (value <= -10) return "bg-loss/15 text-loss";
    if (value < 0) return "bg-loss/8 text-loss";
    if (value >= 20) return "bg-gain/25 text-gain";
    if (value >= 10) return "bg-gain/15 text-gain";
    if (value > 0) return "bg-gain/8 text-gain";
    return "text-text-secondary";
  }

  function formatCell(value: number | undefined): string {
    if (value === undefined) return "—";
    return `${pnlSign(value)}${pctFmt.format(value)}%`;
  }

  type ColumnDef = {
    key: SortColumn;
    label: string;
    field: keyof OpportunityRow;
  };
  const columns: ColumnDef[] = [
    { key: "1d", label: "1D", field: "change1D" },
    { key: "7d", label: "7D", field: "change7D" },
    { key: "1m", label: "1M", field: "change1M" },
    { key: "3m", label: "3M", field: "change3M" },
    { key: "6m", label: "6M", field: "change6M" },
    { key: "ytd", label: "YTD", field: "changeYTD" },
    { key: "200ma", label: "200D MA", field: "diff200MA" },
  ];
</script>

{#if rows.length > 0}
  <div>
    <h2 class="mb-3 text-lg font-semibold text-text-primary">
      Buying Opportunities
    </h2>
    <p class="mb-4 text-xs text-text-secondary">
      Price change from historical close and distance from 200-day moving
      average. Click column headers to sort.
    </p>
    <div
      class="overflow-x-auto rounded-xl border border-border bg-surface-raised"
    >
      <table class="w-full text-xs">
        <thead>
          <tr
            class="border-b border-border text-[10px] font-medium uppercase tracking-wider text-text-secondary"
          >
            <th
              class="sticky left-0 z-10 bg-surface-raised py-2.5 pl-4 pr-3 text-left"
            >
              <button
                onclick={() => toggleSort("symbol")}
                class="hover:text-text-primary transition-colors"
              >
                Instrument
                {#if sortCol === "symbol"}
                  <span class="ml-0.5 text-[9px]"
                    >{sortDir === "asc" ? "▲" : "▼"}</span
                  >
                {/if}
              </button>
            </th>
            {#each columns as col (col.key)}
              <th class="whitespace-nowrap px-3 py-2.5 text-right">
                <button
                  onclick={() => toggleSort(col.key)}
                  class="hover:text-text-primary transition-colors"
                >
                  {col.label}
                  {#if sortCol === col.key}
                    <span class="ml-0.5 text-[9px]"
                      >{sortDir === "asc" ? "▲" : "▼"}</span
                    >
                  {/if}
                </button>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each sortedRows as row (row.instrumentId)}
            <tr
              class="border-b border-border/30 last:border-b-0 transition-colors hover:bg-surface-overlay/30"
            >
              <td class="sticky left-0 z-10 bg-surface-raised py-2.5 pl-4 pr-3">
                <div class="flex items-center gap-2">
                  {#if row.logoUrl}
                    <img
                      src={row.logoUrl}
                      alt={row.symbol}
                      class="h-5 w-5 shrink-0 rounded-full"
                    />
                  {:else}
                    <div
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-[8px] font-bold text-text-secondary"
                    >
                      {row.symbol.slice(0, 2)}
                    </div>
                  {/if}
                  <div class="leading-tight">
                    <span class="font-medium text-text-primary"
                      >{row.symbol}</span
                    >
                    {#if row.displayName}
                      <span class="ml-1.5 hidden text-text-secondary sm:inline"
                        >{row.displayName}</span
                      >
                    {/if}
                  </div>
                </div>
              </td>
              {#each columns as col (col.key)}
                {@const value = row[col.field] as number | undefined}
                <td
                  class="whitespace-nowrap px-3 py-2.5 text-right tabular-nums {cellColor(
                    value,
                  )}"
                >
                  {formatCell(value)}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}
