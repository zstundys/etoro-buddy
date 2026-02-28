<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition } from "$lib/etoro-api";
  import { COLORS, symbolColor } from "$lib/chart-utils";
  import { currency as fmt, normalizeSymbol } from "$lib/format";

  let {
    positions,
    colorMap = new Map(),
  }: {
    positions: EnrichedPosition[];
    colorMap?: Map<string, string>;
  } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let hoveredSymbol = $state<string | null>(null);
  let selected = $state<Set<string>>(new Set());

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
    symbol: string;
    totalInvested: number;
    monthLabel: string;
  }>({ show: false, x: 0, y: 0, symbol: "", totalInvested: 0, monthLabel: "" });

  const HEIGHT = 300;
  const MARGINS = { top: 10, right: 10, bottom: 30, left: 10 };

  $effect(() => {
    if (!containerEl) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) width = entry.contentRect.width;
    });
    resizeObserver.observe(containerEl);

    return () => resizeObserver.disconnect();
  });

  $effect(() => {
    if (!containerEl || width <= 0 || positions.length === 0) return;
    const currentHover = hoveredSymbol;
    const sel = selected;

    const positionsWithDate = positions.filter((p) => p.openDateTime);
    if (positionsWithDate.length === 0) return;

    const minDate = d3.min(positionsWithDate, (p) => new Date(p.openDateTime))!;
    const maxDate = d3.max(positionsWithDate, (p) => new Date(p.openDateTime))!;
    const months = d3.timeMonth.range(minDate, d3.timeMonth.offset(maxDate, 1));

    if (months.length === 0) return;

    // Group by normalized symbol
    const bySymbol = new Map<string, EnrichedPosition[]>();
    for (const p of positionsWithDate) {
      const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(p);
    }
    const allSymbols = [...bySymbol.keys()];
    const hasSelection = sel.size > 0;
    const symbols = hasSelection
      ? allSymbols.filter((s) => sel.has(s))
      : allSymbols;

    // Build monthly cumulative data
    const monthData = months.map((month) => {
      const monthEnd = d3.timeMonth.offset(month, 1);
      const row: Record<string, number | Date> = { month };
      for (const sym of symbols) {
        const posList = bySymbol.get(sym)!;
        const cumulative = posList
          .filter((p) => new Date(p.openDateTime) <= monthEnd)
          .reduce((s, p) => s + p.amount, 0);
        row[sym] = cumulative;
      }
      return row;
    });

    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    const xScale = d3
      .scaleTime()
      .domain([months[0], months[months.length - 1]])
      .range([0, innerWidth]);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(8, months.length))
      .tickFormat((d) => d3.timeFormat("%b %Y")(d as Date));

    let svg = d3.select(containerEl).select<SVGSVGElement>("svg");
    if (svg.empty()) {
      svg = d3
        .select(containerEl)
        .append("svg")
        .attr("width", width)
        .attr("height", HEIGHT);
    } else {
      svg = svg.attr("width", width).attr("height", HEIGHT);
    }

    svg.selectAll("*").remove();

    const chartG = svg
      .append("g")
      .attr("transform", `translate(${MARGINS.left},${MARGINS.top})`);

    if (months.length === 1) {
      // Fallback: simple stacked bars for single month
      const stack = d3
        .stack<Record<string, number | Date>>()
        .keys(symbols)
        .offset(d3.stackOffsetNone);

      const stacked = stack(monthData);
      const yMax = d3.max(stacked, (s) => d3.max(s, (d) => d[1])) ?? 1;
      const yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

      const barWidth = Math.max(20, innerWidth * 0.3);
      const barX = (innerWidth - barWidth) / 2;

      stacked.forEach((series, i) => {
        const key = series.key;
        const d = series[0];
        const y0 = yScale(d[0]);
        const y1 = yScale(d[1]);
        const h = y0 - y1;

        const barRect = chartG
          .append("rect")
          .attr("x", barX)
          .attr("y", y1)
          .attr("width", barWidth)
          .attr("height", Math.max(0, h))
          .attr("fill", symbolColor(key, colorMap))
          .attr("opacity", () =>
            currentHover === null ? 1 : currentHover === key ? 1 : 0.3,
          )
          .style("cursor", "pointer")
          .style("transition", "opacity 0.2s");

        barRect
          .on("mouseenter", function (event) {
            hoveredSymbol = key;
            tooltip = {
              show: true,
              x: event.clientX,
              y: event.clientY,
              symbol: key,
              totalInvested: d[1] - d[0],
              monthLabel: d3.timeFormat("%B %Y")(
                (d.data as Record<string, Date>).month as Date,
              ),
            };
          })
          .on("mousemove", function (event) {
            tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
          })
          .on("mouseleave", () => {
            hoveredSymbol = null;
            tooltip = { ...tooltip, show: false };
          });
      });

      // X-axis for single bar (centered label)
      chartG
        .append("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(xAxis);
    } else {
      // Streamgraph
      const stack = d3
        .stack<Record<string, number | Date>>()
        .keys(symbols)
        .offset(d3.stackOffsetWiggle)
        .order(d3.stackOrderInsideOut);

      const stacked = stack(monthData);

      const yExtent = [
        d3.min(stacked, (s) => d3.min(s, (d) => d[0])) ?? 0,
        d3.max(stacked, (s) => d3.max(s, (d) => d[1])) ?? 1,
      ] as [number, number];
      const yScale = d3.scaleLinear().domain(yExtent).range([innerHeight, 0]);

      type StackPoint = d3.SeriesPoint<Record<string, number | Date>>;
      const area = d3
        .area<StackPoint>()
        .x((d) => xScale((d.data as Record<string, Date>).month as Date))
        .y0((d) => yScale(d[0]))
        .y1((d) => yScale(d[1]))
        .curve(d3.curveBasis);

      const bisect = d3.bisector(
        (d: Record<string, number | Date>) => d.month as Date,
      ).left;

      stacked.forEach((series) => {
        const key = series.key;
        const path = chartG
          .append("path")
          .datum(series)
          .attr("fill", symbolColor(key, colorMap))
          .attr("d", area)
          .attr("opacity", () =>
            currentHover === null ? 1 : currentHover === key ? 1 : 0.3,
          )
          .style("cursor", "pointer")
          .style("transition", "opacity 0.2s");

        path
          .on("mouseenter", function (event) {
            hoveredSymbol = key;
            const containerRect = containerEl!.getBoundingClientRect();
            const mouseX = event.clientX - containerRect.left - MARGINS.left;
            const x0 = xScale.invert(mouseX);
            const i = Math.min(bisect(monthData, x0), monthData.length - 1);
            const row = monthData[i];
            const val = (row[key] as number) ?? 0;
            tooltip = {
              show: true,
              x: event.clientX,
              y: event.clientY,
              symbol: key,
              totalInvested: val,
              monthLabel: d3.timeFormat("%B %Y")(row.month as Date),
            };
          })
          .on("mousemove", function (event) {
            const containerRect = containerEl!.getBoundingClientRect();
            const mouseX = event.clientX - containerRect.left - MARGINS.left;
            const x0 = xScale.invert(mouseX);
            const i = Math.min(bisect(monthData, x0), monthData.length - 1);
            const row = monthData[i];
            const val = (row[key] as number) ?? 0;
            tooltip = {
              show: true,
              x: event.clientX,
              y: event.clientY,
              symbol: key,
              totalInvested: val,
              monthLabel: d3.timeFormat("%B %Y")(row.month as Date),
            };
          })
          .on("mouseleave", () => {
            hoveredSymbol = null;
            tooltip = { ...tooltip, show: false };
          });
      });

      // X-axis
      chartG
        .append("g")
        .attr("class", "axis axis-x")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(xAxis);
    }

    chartG
      .selectAll(".axis text")
      .attr("fill", COLORS.textSecondary)
      .attr("font-size", 10);
    chartG.selectAll(".axis path, .axis line").attr("stroke", COLORS.border);
  });
</script>

<div class="relative flex flex-col">
  <div bind:this={containerEl} style="height: {HEIGHT}px"></div>
  {#if positions.length > 0}
    {@const positionsWithDate = positions.filter((p) => p.openDateTime)}
    {#if positionsWithDate.length > 0}
      {@const legendSymbols = [
        ...new Set(
          positionsWithDate.map((p) =>
            normalizeSymbol(p.symbol ?? `#${p.instrumentId}`),
          ),
        ),
      ]}
      {@const hasSelection = selected.size > 0}
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {#each legendSymbols as symbol (symbol)}
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
  {/if}
  {#if tooltip.show}
    <div
      class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
      style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y +
        12}px; z-index: 50"
    >
      <div class="font-semibold text-text-primary">{tooltip.symbol}</div>
      <div class="mt-1 text-text-secondary">{tooltip.monthLabel}</div>
      <div class="mt-0.5 text-text-secondary">
        Invested: {fmt.format(tooltip.totalInvested)}
      </div>
    </div>
  {/if}
</div>
