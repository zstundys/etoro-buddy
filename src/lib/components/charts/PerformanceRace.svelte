<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition, Candle } from "$lib/etoro-api";
  import { COLORS, symbolColor, groupBySymbol } from "$lib/chart-utils";
  import { percent as pctFmt, normalizeSymbol } from "$lib/format";

  let {
    positions,
    candleMap,
    colorMap = new Map(),
  }: {
    positions: EnrichedPosition[];
    candleMap: Map<number, Candle[]>;
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
    date: string;
    lines: { symbol: string; pct: number }[];
  }>({ show: false, x: 0, y: 0, date: "", lines: [] });

  const HEIGHT = 300;
  const MARGINS = { top: 10, right: 10, bottom: 30, left: 50 };

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

    const groups = groupBySymbol(positions);
    type SeriesPoint = { date: Date; pct: number };
    const allSeries: { symbol: string; data: SeriesPoint[] }[] = [];

    for (const g of groups) {
      const rep = g.positions[0];
      const candles = candleMap.get(rep.instrumentId);
      if (!candles || candles.length === 0) continue;
      const openRate =
        g.positions.reduce((s, p) => s + p.openRate * p.amount, 0) /
        g.positions.reduce((s, p) => s + p.amount, 0);
      if (openRate <= 0) continue;

      const points: SeriesPoint[] = candles.map((c) => ({
        date: new Date(c.date),
        pct: ((c.close - openRate) / openRate) * 100,
      }));
      allSeries.push({ symbol: g.symbol, data: points });
    }

    if (allSeries.length === 0) return;

    const hasSelection = sel.size > 0;
    const visibleSeries = hasSelection
      ? allSeries.filter((s) => sel.has(s.symbol))
      : allSeries;

    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    const allDates = allSeries.flatMap((s) => s.data.map((d) => d.date));
    const visiblePcts = visibleSeries.flatMap((s) => s.data.map((d) => d.pct));

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(allDates) as [Date, Date])
      .range([0, innerWidth]);
    const yMin = Math.min(d3.min(visiblePcts) ?? -10, -5);
    const yMax = Math.max(d3.max(visiblePcts) ?? 10, 5);
    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([innerHeight, 0])
      .nice();

    const line = d3
      .line<SeriesPoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.pct))
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

    if (yScale(0) >= 0 && yScale(0) <= innerHeight) {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", innerWidth)
        .attr("y1", yScale(0))
        .attr("y2", yScale(0))
        .attr("stroke", COLORS.textSecondary)
        .attr("stroke-dasharray", "4,4")
        .attr("stroke-width", 1);
    }

    for (const s of allSeries) {
      const isVisible = !hasSelection || sel.has(s.symbol);
      const isHoverTarget = currentHover === s.symbol;

      g.append("path")
        .datum(s.data)
        .attr("fill", "none")
        .attr("stroke", symbolColor(s.symbol, colorMap))
        .attr("stroke-width", isHoverTarget ? 3 : isVisible ? 2 : 1)
        .attr("opacity", () => {
          if (!isVisible) return 0.08;
          if (currentHover === null || isHoverTarget) return 1;
          return 0.3;
        })
        .attr("d", line)
        .style("transition", "opacity 0.2s, stroke-width 0.2s");
    }

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(8, allDates.length))
      .tickFormat((d) => d3.timeFormat("%b %d")(d as Date));
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${Number(d)}%`);

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

    const allSortedDates = [...new Set(allDates.map((d) => d.getTime()))]
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
    const bisect = d3.bisector((d: Date) => d).left;

    const overlay = g
      .append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "none")
      .attr("pointer-events", "all");

    const crosshair = g
      .append("line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", COLORS.textSecondary)
      .attr("stroke-dasharray", "3,3")
      .attr("opacity", 0);

    overlay
      .on("mousemove", function (event) {
        const [mx] = d3.pointer(event);
        const x0 = xScale.invert(mx);
        const i = Math.min(
          bisect(allSortedDates, x0),
          allSortedDates.length - 1,
        );
        const date = allSortedDates[i];
        const xPos = xScale(date);
        crosshair.attr("x1", xPos).attr("x2", xPos).attr("opacity", 1);

        const tooltipSeries = hasSelection ? visibleSeries : allSeries;
        const lines: { symbol: string; pct: number }[] = [];
        for (const s of tooltipSeries) {
          const closest = s.data.reduce((prev, curr) =>
            Math.abs(curr.date.getTime() - date.getTime()) <
            Math.abs(prev.date.getTime() - date.getTime())
              ? curr
              : prev,
          );
          lines.push({ symbol: s.symbol, pct: closest.pct });
        }
        lines.sort((a, b) => b.pct - a.pct);

        tooltip = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          date: d3.timeFormat("%b %d, %Y")(date),
          lines,
        };
      })
      .on("mouseleave", () => {
        crosshair.attr("opacity", 0);
        tooltip = { ...tooltip, show: false };
      });
  });
</script>

<div class="relative flex flex-col">
  <div bind:this={containerEl} style="height: {HEIGHT}px"></div>
  {#if positions.length > 0 && candleMap.size > 0}
    {@const groups = groupBySymbol(positions)}
    {@const hasSelection = selected.size > 0}
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {#each groups as g (g.symbol)}
        {@const active = !hasSelection || selected.has(g.symbol)}
        <button
          type="button"
          class="flex items-center gap-1.5 text-xs transition-colors hover:text-text-primary"
          class:text-text-primary={active}
          class:text-text-secondary={!active}
          class:opacity-40={!active}
          onclick={() => toggleSymbol(g.symbol)}
          onmouseenter={() => (hoveredSymbol = g.symbol)}
          onmouseleave={() => (hoveredSymbol = null)}
        >
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            style="background-color: {symbolColor(g.symbol, colorMap)}"
          ></span>
          <span>{g.symbol}</span>
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
      {#each tooltip.lines.slice(0, 8) as item (item.symbol)}
        <div class="mt-0.5 flex items-center gap-1.5">
          <span
            class="h-2 w-2 rounded-full"
            style="background-color: {symbolColor(item.symbol, colorMap)}"
          ></span>
          <span class={item.pct >= 0 ? "text-gain" : "text-loss"}
            >{item.symbol}: {item.pct >= 0 ? "+" : ""}{pctFmt.format(
              item.pct,
            )}%</span
          >
        </div>
      {/each}
    </div>
  {/if}
</div>
