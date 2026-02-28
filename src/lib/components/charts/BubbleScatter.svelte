<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition } from "$lib/etoro-api";
  import { COLORS } from "$lib/chart-utils";
  import {
    currency as fmt,
    percent as pctFmt,
    shortDate as dateFmt,
    normalizeSymbol,
  } from "$lib/format";

  let { positions }: { positions: EnrichedPosition[] } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let tooltip = $state<{
    show: boolean;
    x: number;
    y: number;
    symbol: string;
    date: string;
    amount: number;
    pnl: number | undefined;
    pnlPercent: number | undefined;
  }>({
    show: false,
    x: 0,
    y: 0,
    symbol: "",
    date: "",
    amount: 0,
    pnl: undefined,
    pnlPercent: undefined,
  });

  const HEIGHT = 350;
  const MARGINS = { top: 20, right: 20, bottom: 35, left: 55 };

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
    if (!containerEl || width <= 0) return;

    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = HEIGHT - MARGINS.top - MARGINS.bottom;

    const data = positions
      .filter((p) => p.openDateTime)
      .map((p) => ({
        ...p,
        date: new Date(p.openDateTime),
        pnlPct: p.pnlPercent ?? 0,
      }));

    const xExtent = d3.extent(data, (d) => d.date) as [Date, Date];
    const yExtent = d3.extent(data, (d) => d.pnlPct) as [number, number];
    const amountExtent = d3.extent(data, (d) => d.amount) as [number, number];

    // Pad domains for better visibility
    const xDomain =
      xExtent[0] && xExtent[1] ? xExtent : [new Date(), new Date()];
    const yMin = yExtent[0] !== undefined ? Math.min(yExtent[0], 0) : -10;
    const yMax = yExtent[1] !== undefined ? Math.max(yExtent[1], 0) : 10;
    const yDomain: [number, number] = [yMin, yMax];
    const amountDomain =
      amountExtent[0] !== undefined && amountExtent[1] !== undefined
        ? amountExtent
        : [0, 1];

    const xScale = d3.scaleTime().domain(xDomain).range([0, innerWidth]);
    const yScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);
    const rScale = d3.scaleSqrt().domain(amountDomain).range([4, 30]);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => d3.timeFormat("%b %d")(d as Date));
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${Number(d)}%`);

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

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGINS.left},${MARGINS.top})`);

    // Gridlines
    g.append("g")
      .attr("class", "grid grid-x")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(5)
          .tickSize(-innerHeight)
          .tickFormat(() => ""),
      )
      .selectAll("line")
      .attr("stroke", COLORS.border)
      .attr("stroke-opacity", 0.5);

    g.append("g")
      .attr("class", "grid grid-y")
      .call(
        d3
          .axisLeft(yScale)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => ""),
      )
      .selectAll("line")
      .attr("stroke", COLORS.border)
      .attr("stroke-opacity", 0.5);

    // Zero line
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

    // Axes
    const axisXG = g
      .append("g")
      .attr("class", "axis axis-x")
      .attr("transform", `translate(0,${innerHeight})`);
    axisXG.call(xAxis);
    axisXG
      .selectAll("text")
      .attr("fill", COLORS.textSecondary)
      .attr("font-size", 10);
    axisXG.selectAll("path, line").attr("stroke", COLORS.border);

    const axisYG = g.append("g").attr("class", "axis axis-y");
    axisYG.call(yAxis);
    axisYG
      .selectAll("text")
      .attr("fill", COLORS.textSecondary)
      .attr("font-size", 10);
    axisYG.selectAll("path, line").attr("stroke", COLORS.border);

    // Bubbles
    const circles = g
      .selectAll<SVGCircleElement, (typeof data)[number]>("circle.bubble")
      .data(data, (d) => `${d.positionId}`)
      .join("circle")
      .attr("class", "bubble")
      .attr("cx", (d) => xScale(d.date))
      .attr("cy", (d) => yScale(d.pnlPct))
      .attr("r", (d) => rScale(d.amount))
      .attr("fill", (d) => {
        const base = (d.pnl ?? 0) >= 0 ? COLORS.gain : COLORS.loss;
        return d3.color(base)!.copy({ opacity: 0.7 }).toString();
      })
      .attr("stroke", (d) => {
        const base = (d.pnl ?? 0) >= 0 ? COLORS.gain : COLORS.loss;
        return d3.color(base)!.darker(0.5).toString();
      })
      .attr("stroke-width", 1)
      .style("cursor", "pointer");

    circles
      .on("mouseenter", function (event, d) {
        tooltip = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          symbol: normalizeSymbol(d.symbol ?? `#${d.instrumentId}`),
          date: dateFmt.format(d.date),
          amount: d.amount,
          pnl: d.pnl,
          pnlPercent: d.pnlPercent,
        };
      })
      .on("mousemove", function (event) {
        tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
      })
      .on("mouseleave", () => {
        tooltip = { ...tooltip, show: false };
      });
  });
</script>

<div class="relative" bind:this={containerEl} style="height: {HEIGHT}px">
  {#if tooltip.show}
    <div
      class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
      style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y +
        12}px; z-index: 50"
    >
      <div class="font-semibold text-text-primary">{tooltip.symbol}</div>
      <div class="mt-1 text-text-secondary">{tooltip.date}</div>
      <div class="mt-0.5 text-text-secondary">
        Invested: {fmt.format(tooltip.amount)}
      </div>
      {#if tooltip.pnl !== undefined}
        <div class="mt-0.5 {tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
          P&L: {tooltip.pnl >= 0 ? "+" : ""}{fmt.format(tooltip.pnl)}
          {#if tooltip.pnlPercent !== undefined}
            ({tooltip.pnlPercent >= 0 ? "+" : ""}{pctFmt.format(
              tooltip.pnlPercent,
            )}%)
          {/if}
        </div>
      {:else if tooltip.pnlPercent !== undefined}
        <div
          class="mt-0.5 {tooltip.pnlPercent >= 0 ? 'text-gain' : 'text-loss'}"
        >
          P&L%: {tooltip.pnlPercent >= 0 ? "+" : ""}{pctFmt.format(
            tooltip.pnlPercent,
          )}%
        </div>
      {/if}
    </div>
  {/if}
</div>
