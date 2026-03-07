<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition, Candle } from "$lib/etoro-api";
  import { COLORS, symbolColor } from "$lib/chart-utils";
  import { normalizeSymbol, currency as currencyFmt } from "$lib/format";
  import Money from "../Money.svelte";

  type OpenMarker = {
    cx: number;
    cy: number;
    symbol: string;
    date: Date;
    amount: number;
    units: number;
    openRate: number;
    color: string;
  };

  let {
    positions,
    candleMap,
    availableCash = 0,
    colorMap = new Map(),
    dateStart,
    dateEnd,
    onrangeselect,
  }: {
    positions: EnrichedPosition[];
    candleMap: Map<number, Candle[]>;
    availableCash: number;
    colorMap?: Map<string, string>;
    dateStart?: Date;
    dateEnd?: Date;
    onrangeselect?: (start: Date, end: Date) => void;
  } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let hoveredSymbol = $state<string | null>(null);
  let selected = $state<Set<string>>(new Set());

  let dragStartIdx = $state<number | null>(null);
  let dragEndIdx = $state<number | null>(null);
  let mouseX = $state(0);
  let mouseY = $state(0);

  const isDragging = $derived(
    dragStartIdx !== null && dragEndIdx !== null && dragStartIdx !== dragEndIdx,
  );

  const dragRange = $derived.by(() => {
    if (!isDragging || dragStartIdx === null || dragEndIdx === null) return null;
    const [lo, hi] = dragStartIdx < dragEndIdx
      ? [dragStartIdx, dragEndIdx]
      : [dragEndIdx, dragStartIdx];
    if (lo >= chartRef.data.length || hi >= chartRef.data.length) return null;
    const startDate = chartRef.data[lo]?.date as Date | undefined;
    const endDate = chartRef.data[hi]?.date as Date | undefined;
    if (!startDate || !endDate) return null;
    return {
      startLabel: d3.timeFormat("%b %d, %Y")(startDate),
      endLabel: d3.timeFormat("%b %d, %Y")(endDate),
    };
  });

  let chartRef: {
    data: Record<string, number | Date>[];
    xScale: d3.ScaleTime<number, number>;
    bisect: d3.Bisector<Record<string, number | Date>, Date>;
    overlay: { node(): SVGRectElement | null } | null;
    dragHighlight: { attr(name: string, value: unknown): any } | null;
  } = {
    data: [],
    xScale: d3.scaleTime(),
    bisect: d3.bisector((d: Record<string, number | Date>) => d.date as Date),
    overlay: null,
    dragHighlight: null,
  };

  $effect(() => {
    if (dragStartIdx === null) return;
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const rect = chartRef.overlay?.node()?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const x0 = chartRef.xScale.invert(mx);
      const idx = Math.max(
        0,
        Math.min(chartRef.bisect.left(chartRef.data, x0), chartRef.data.length - 1),
      );
      dragEndIdx = idx;
      if (dragStartIdx !== null && dragEndIdx !== null && dragStartIdx !== dragEndIdx) {
        const [lo, hi] = dragStartIdx < dragEndIdx
          ? [dragStartIdx, dragEndIdx]
          : [dragEndIdx, dragStartIdx];
        const px0 = chartRef.xScale(chartRef.data[lo].date as Date);
        const px1 = chartRef.xScale(chartRef.data[hi].date as Date);
        chartRef.dragHighlight?.attr("x", px0).attr("width", px1 - px0).attr("opacity", 0.15);
      }
    };
    const onUp = () => {
      if (
        onrangeselect &&
        dragStartIdx !== null &&
        dragEndIdx !== null &&
        dragStartIdx !== dragEndIdx
      ) {
        const [lo, hi] = dragStartIdx < dragEndIdx
          ? [dragStartIdx, dragEndIdx]
          : [dragEndIdx, dragStartIdx];
        onrangeselect(chartRef.data[lo].date as Date, chartRef.data[hi].date as Date);
      }
      dragStartIdx = null;
      dragEndIdx = null;
      chartRef.dragHighlight?.attr("opacity", 0);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  });

  function toggleSymbol(sym: string) {
    const next = new Set(selected);
    if (next.has(sym)) next.delete(sym);
    else next.add(sym);
    selected = next;
  }

  let tooltip = $state<{
    show: boolean;
    x: number;
    y: number;
    date: string;
    total: number;
    breakdown: { symbol: string; value: number }[];
    opens: { symbol: string; amount: number; units: number; openRate: number; color: string }[];
  }>({ show: false, x: 0, y: 0, date: "", total: 0, breakdown: [], opens: [] });

  const HEIGHT = 320;
  const MARGINS = { top: 10, right: 10, bottom: 30, left: 60 };

  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) width = entry.contentRect.width;
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (
      !containerEl ||
      width <= 0 ||
      positions.length === 0 ||
      candleMap.size === 0
    )
      return;
    const currentHover = hoveredSymbol;
    const sel = selected;

    const bySymbol = new Map<
      string,
      { instrumentId: number; units: number; openDate: Date }[]
    >();
    for (const p of positions) {
      if (!p.openDateTime) continue;
      const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push({
        instrumentId: p.instrumentId,
        units: p.units * (p.isBuy ? 1 : -1),
        openDate: new Date(p.openDateTime),
      });
    }
    const symbols = [...bySymbol.keys()];
    if (symbols.length === 0) return;

    const allDates = new Set<string>();
    const priceMap = new Map<string, Map<number, number>>();
    for (const [instrumentId, candles] of candleMap) {
      for (const c of candles) {
        const dateKey = c.date.slice(0, 10);
        allDates.add(dateKey);
        if (!priceMap.has(dateKey)) priceMap.set(dateKey, new Map());
        priceMap.get(dateKey)!.set(instrumentId, c.close);
      }
    }

    const minCoverage = Math.ceil(candleMap.size * 0.5);
    const sortedDates = [...allDates]
      .sort()
      .map((d) => new Date(d))
      .filter((date) => {
        const prices = priceMap.get(date.toISOString().slice(0, 10));
        if (prices == null || prices.size < minCoverage) return false;
        if (dateStart && date < dateStart) return false;
        if (dateEnd && date > dateEnd) return false;
        return true;
      });
    if (sortedDates.length === 0) return;

    const data = sortedDates.map((date) => {
      const dateKey = date.toISOString().slice(0, 10);
      const prices = priceMap.get(dateKey);
      const row: Record<string, number | Date> = { date };
      for (const sym of symbols) {
        let val = 0;
        for (const pos of bySymbol.get(sym)!) {
          if (date < pos.openDate) continue;
          const price = prices?.get(pos.instrumentId);
          if (price !== undefined) val += pos.units * price;
        }
        row[sym] = Math.max(0, val);
      }
      return row;
    });

    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    const xScale = d3
      .scaleTime()
      .domain([sortedDates[0], sortedDates[sortedDates.length - 1]])
      .range([0, innerWidth]);

    const hasSelection = sel.size > 0;
    const visibleSymbols = hasSelection
      ? symbols.filter((s) => sel.has(s))
      : symbols;

    const stack = d3
      .stack<Record<string, number | Date>>()
      .keys(visibleSymbols)
      .offset(d3.stackOffsetNone)
      .order(d3.stackOrderNone);
    const stacked = stack(data);

    const yMax = (d3.max(stacked, (s) => d3.max(s, (d) => d[1])) ?? 1) * 1.05;
    const yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

    const area = d3
      .area<d3.SeriesPoint<Record<string, number | Date>>>()
      .x((d) => xScale((d.data as Record<string, Date>).date))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    let svg = d3.select(containerEl).select<SVGSVGElement>("svg");
    if (svg.empty()) {
      svg = d3
        .select(containerEl)
        .append("svg")
        .attr("width", width)
        .attr("height", HEIGHT);
    } else {
      svg.attr("width", width).attr("height", HEIGHT);
    }
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGINS.left},${MARGINS.top})`);

    stacked.forEach((series) => {
      const key = series.key;
      g.append("path")
        .datum(series)
        .attr("fill", symbolColor(key, colorMap))
        .attr("d", area)
        .attr(
          "opacity",
          currentHover === null ? 0.85 : currentHover === key ? 1 : 0.2,
        )
        .style("transition", "opacity 0.2s");
    });

    const stackLookup = new Map<
      string,
      d3.Series<Record<string, number | Date>, string>
    >();
    for (const s of stacked) stackLookup.set(s.key, s);

    const openMarkers: OpenMarker[] = [];
    for (const p of positions) {
      if (!p.openDateTime) continue;
      const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
      if (hasSelection && !sel.has(sym)) continue;
      const openDate = new Date(p.openDateTime);
      const dateKey = openDate.toISOString().slice(0, 10);
      const dateIdx = sortedDates.findIndex(
        (d) => d.toISOString().slice(0, 10) === dateKey,
      );
      if (dateIdx < 0) continue;
      const series = stackLookup.get(sym);
      if (!series) continue;
      const point = series[dateIdx];
      if (!point) continue;
      openMarkers.push({
        cx: xScale(sortedDates[dateIdx]),
        cy: yScale(point[1]),
        symbol: sym,
        date: openDate,
        amount: p.amount,
        units: p.units,
        openRate: p.openRate,
        color: symbolColor(sym, colorMap),
      });
    }

    const markerGroup = g.append("g").attr("class", "open-markers");
    for (const m of openMarkers) {
      const dimmed =
        currentHover !== null && currentHover !== m.symbol;
      markerGroup
        .append("circle")
        .attr("cx", m.cx)
        .attr("cy", m.cy)
        .attr("r", 3)
        .attr("fill", m.color)
        .attr("stroke", COLORS.surface)
        .attr("stroke-width", 1.5)
        .attr("opacity", dimmed ? 0.15 : 0.9)
        .style("transition", "opacity 0.2s");
    }

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(8, sortedDates.length))
      .tickFormat((d) => d3.timeFormat("%b %d")(d as Date));
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `$${d3.format(",.0f")(d as number)}`);

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .attr("fill", COLORS.textSecondary)
      .attr("font-size", 10);
    g.append("g")
      .call(yAxis)
      .selectAll("text")
      .attr("fill", COLORS.textSecondary)
      .attr("font-size", 10);
    g.selectAll(".domain, .tick line").attr("stroke", COLORS.border);

    const markersByDate = new Map<
      string,
      { symbol: string; amount: number; units: number; openRate: number; color: string }[]
    >();
    for (const m of openMarkers) {
      const key = m.date.toISOString().slice(0, 10);
      if (!markersByDate.has(key)) markersByDate.set(key, []);
      markersByDate.get(key)!.push({
        symbol: m.symbol,
        amount: m.amount,
        units: m.units,
        openRate: m.openRate,
        color: m.color,
      });
    }

    const bisect = d3.bisector(
      (d: Record<string, number | Date>) => d.date as Date,
    ).left;

    function idxFromPointer(event: MouseEvent): number {
      const [mx] = d3.pointer(event, overlay.node());
      const x0 = xScale.invert(mx);
      return Math.max(0, Math.min(bisect(data, x0), data.length - 1));
    }

    const dragHighlight = g
      .append("rect")
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", COLORS.brand)
      .attr("opacity", 0);

    const overlay = g
      .append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .attr("cursor", "crosshair");

    const crosshair = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", COLORS.textSecondary)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0);

    chartRef = { data, xScale, bisect: d3.bisector((d: Record<string, number | Date>) => d.date as Date), overlay, dragHighlight };

    function updateDragHighlight() {
      if (dragStartIdx === null || dragEndIdx === null || dragStartIdx === dragEndIdx) {
        dragHighlight.attr("opacity", 0);
        return;
      }
      const [lo, hi] = dragStartIdx < dragEndIdx
        ? [dragStartIdx, dragEndIdx]
        : [dragEndIdx, dragStartIdx];
      const x0 = xScale(data[lo].date as Date);
      const x1 = xScale(data[hi].date as Date);
      dragHighlight
        .attr("x", x0)
        .attr("width", x1 - x0)
        .attr("opacity", 0.15);
    }

    overlay
      .on("mousedown", function (event: MouseEvent) {
        if (!onrangeselect) return;
        const idx = idxFromPointer(event);
        dragStartIdx = idx;
        dragEndIdx = idx;
        mouseX = event.clientX;
        mouseY = event.clientY;
      })
      .on("mousemove", function (event: MouseEvent) {
        mouseX = event.clientX;
        mouseY = event.clientY;

        if (dragStartIdx !== null) {
          dragEndIdx = idxFromPointer(event);
          updateDragHighlight();
          crosshair.attr("opacity", 0);
          tooltip = { ...tooltip, show: false };
          return;
        }

        const i = idxFromPointer(event);
        const row = data[i];
        const xPos = xScale(row.date as Date);
        crosshair.attr("x1", xPos).attr("x2", xPos).attr("opacity", 1);

        const breakdown = visibleSymbols
          .map((sym) => ({
            symbol: sym,
            value: (row[sym] as number) ?? 0,
          }))
          .filter((b) => b.value > 0);
        const total = breakdown.reduce((s, b) => s + b.value, 0) + availableCash;

        const dateKey = (row.date as Date).toISOString().slice(0, 10);
        const opens = markersByDate.get(dateKey) ?? [];

        tooltip = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          date: d3.timeFormat("%b %d, %Y")(row.date as Date),
          total,
          breakdown,
          opens,
        };
      })
      .on("mouseup", function () {
        if (
          onrangeselect &&
          dragStartIdx !== null &&
          dragEndIdx !== null &&
          dragStartIdx !== dragEndIdx
        ) {
          const [lo, hi] = dragStartIdx < dragEndIdx
            ? [dragStartIdx, dragEndIdx]
            : [dragEndIdx, dragStartIdx];
          const startDate = data[lo].date as Date;
          const endDate = data[hi].date as Date;
          onrangeselect(startDate, endDate);
        }
        dragStartIdx = null;
        dragEndIdx = null;
        dragHighlight.attr("opacity", 0);
      })
      .on("mouseleave", () => {
        if (dragStartIdx !== null) return;
        crosshair.attr("opacity", 0);
        tooltip = { ...tooltip, show: false };
      });

  });
</script>

<div class="relative flex flex-col">
  <div bind:this={containerEl} style="height: {HEIGHT}px"></div>
  {#if positions.length > 0 && candleMap.size > 0}
    {@const symbols = [
      ...new Set(
        positions
          .filter((p) => p.openDateTime)
          .map((p) => normalizeSymbol(p.symbol ?? `#${p.instrumentId}`)),
      ),
    ]}
    {@const hasSelection = selected.size > 0}
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {#each symbols as symbol (symbol)}
        {@const active = !hasSelection || selected.has(symbol)}
        <button
          type="button"
          class="flex items-center gap-1.5 text-xs transition-colors hover:text-text-primary"
          class:text-text-primary={active}
          class:text-text-secondary={!active}
          class:opacity-40={!active}
          onclick={() => toggleSymbol(symbol)}
          onmouseenter={() => (hoveredSymbol = symbol)}
          onmouseleave={() => (hoveredSymbol = null)}
        >
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            style="background-color: {symbolColor(symbol, colorMap)}"
          ></span>
          <span>{symbol}</span>
        </button>
      {/each}
      {#if hasSelection}
        <button
          type="button"
          class="text-[10px] text-text-secondary underline decoration-dotted hover:text-text-primary"
          onclick={() => (selected = new Set())}
        >
          clear
        </button>
      {/if}
    </div>
  {/if}
  {#if tooltip.show}
    <div
      class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
      style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y +
        12}px; z-index: 50"
    >
      <div class="font-semibold text-text-primary">{tooltip.date}</div>
      <div class="mt-1 text-text-secondary">
        Total: <Money value={tooltip.total} />
      </div>
      {#each tooltip.breakdown.slice(0, 8) as item (item.symbol)}
        <div class="mt-0.5 flex items-center gap-1.5">
          <span
            class="h-2 w-2 rounded-full"
            style="background-color: {symbolColor(item.symbol, colorMap)}"
          ></span>
          <span class="text-text-secondary"
            >{item.symbol}: <Money value={item.value} /></span
          >
        </div>
      {/each}
      {#if tooltip.opens.length > 0}
        <div class="mt-1.5 border-t border-border/40 pt-1">
          <div class="text-[10px] font-medium text-brand">Opened</div>
          {#each tooltip.opens as o, idx (idx)}
            <div class="mt-0.5 flex items-center gap-1.5">
              <span
                class="h-2 w-2 rounded-full"
                style="background-color: {o.color}"
              ></span>
              <span class="text-text-secondary">{o.symbol}</span>
              <span class="text-text-secondary">@</span>
              <span class="text-text-primary">{currencyFmt.format(o.openRate)}</span>
              <span class="text-text-secondary">&times;</span>
              <span data-private>{o.units.toFixed(o.units % 1 === 0 ? 0 : 4)}</span>
              <span class="text-text-secondary">=</span>
              <Money value={o.amount} />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
  {#if dragRange}
    <div
      class="fixed whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] shadow-lg pointer-events-none"
      style="left: {mouseX + 10}px; top: {mouseY - 32}px; z-index: 9999"
    >
      <span class="text-text-secondary">{dragRange.startLabel}</span>
      <span class="text-text-secondary mx-1">&rarr;</span>
      <span class="text-text-secondary">{dragRange.endLabel}</span>
    </div>
  {/if}
</div>
