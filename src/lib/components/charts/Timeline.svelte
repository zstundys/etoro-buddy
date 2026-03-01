<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition } from "$lib/etoro-api";
  import { COLORS, pnlColorScale, groupBySymbol } from "$lib/chart-utils";
  import {
    shortDate as dateFmt,
    percent as pctFmt,
  } from "$lib/format";
  import Money from "../Money.svelte";

  let { positions }: { positions: EnrichedPosition[] } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let hoveredPositionId: number | null = $state(null);
  let tooltip = $state<{
    show: boolean;
    x: number;
    y: number;
    symbol: string;
    openDate: string;
    amount: number;
    pnl: number | undefined;
    pnlPercent: number | undefined;
  }>({
    show: false,
    x: 0,
    y: 0,
    symbol: "",
    openDate: "",
    amount: 0,
    pnl: undefined,
    pnlPercent: undefined,
  });

  const MARGINS = { top: 10, right: 20, bottom: 35, left: 80 };
  const ROW_HEIGHT = 4;
  const BAR_HEIGHT = 2;
  const GROUP_GAP = 2;

  const sortedGroups = $derived.by(() => {
    const groups = groupBySymbol(positions);
    return [...groups].sort((a, b) => b.totalAmount - a.totalAmount);
  });

  const chartHeight = $derived.by(() => {
    const totalRows = sortedGroups.reduce(
      (sum, g) => sum + g.positions.length,
      0,
    );
    const totalGroupGaps = Math.max(0, sortedGroups.length - 1) * GROUP_GAP;
    return Math.max(
      200,
      MARGINS.top + MARGINS.bottom + totalRows * ROW_HEIGHT + totalGroupGaps,
    );
  });

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

    const visible = sortedGroups;
    if (visible.length === 0) {
      d3.select(containerEl).selectAll("svg").remove();
      return;
    }

    const height = chartHeight;
    const innerWidth = width - MARGINS.left - MARGINS.right;
    const innerHeight = height - MARGINS.top - MARGINS.bottom;

    const today = new Date();
    const allPositions = visible.flatMap((g) => g.positions);
    const minDate =
      allPositions.length > 0
        ? (d3.min(allPositions, (p) => new Date(p.openDateTime)) ?? today)
        : today;
    const maxDate = today;

    const xScale = d3
      .scaleTime()
      .domain([minDate, maxDate])
      .range([0, innerWidth]);

    // Build a row layout: each position gets its own row, grouped by symbol
    type RowInfo = {
      group: (typeof visible)[0];
      pos: (typeof allPositions)[0];
      y: number;
    };
    const rows: RowInfo[] = [];
    let currentY = 0;
    const groupYRanges: { symbol: string; yStart: number; yEnd: number }[] = [];

    for (const group of visible) {
      const groupStart = currentY;
      const sorted = [...group.positions].sort(
        (a, b) =>
          new Date(a.openDateTime).getTime() -
          new Date(b.openDateTime).getTime(),
      );
      for (const pos of sorted) {
        rows.push({ group, pos, y: currentY });
        currentY += ROW_HEIGHT;
      }
      groupYRanges.push({
        symbol: group.symbol,
        yStart: groupStart,
        yEnd: currentY,
      });
      currentY += GROUP_GAP;
    }

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(8)
      .tickFormat((d) => d3.timeFormat("%b %Y")(d as Date));

    let svg = d3.select(containerEl).select<SVGSVGElement>("svg");
    if (svg.empty()) {
      svg = d3
        .select(containerEl)
        .append("svg")
        .attr("width", width)
        .attr("height", height);
    } else {
      svg = svg.attr("width", width).attr("height", height);
    }

    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${MARGINS.left},${MARGINS.top})`);

    // Horizontal gridlines between symbol groups
    const gridColor = d3
      .color(COLORS.border)!
      .copy({ opacity: 0.3 })
      .toString();
    for (const range of groupYRanges) {
      if (range.yEnd < innerHeight) {
        g.append("line")
          .attr("x1", 0)
          .attr("x2", innerWidth)
          .attr("y1", range.yEnd + GROUP_GAP / 2)
          .attr("y2", range.yEnd + GROUP_GAP / 2)
          .attr("stroke", gridColor)
          .attr("stroke-width", 1);
      }
    }

    // Y-axis labels (one per symbol group, centered across its rows)
    for (const range of groupYRanges) {
      const centerY = (range.yStart + range.yEnd) / 2;
      g.append("text")
        .attr("x", -8)
        .attr("y", centerY)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("fill", COLORS.textPrimary)
        .attr("font-size", 11)
        .text(range.symbol);
    }

    // Bars — one per position, each on its own row
    const currentHover = hoveredPositionId;
    for (const { group, pos, y } of rows) {
      const startDate = new Date(pos.openDateTime);
      const x = xScale(startDate);
      const endX = xScale(today);
      const barWidth = Math.max(2, endX - x);
      const barTop = y + (ROW_HEIGHT - BAR_HEIGHT) / 2;

      const rect = g
        .append("rect")
        .attr("x", x)
        .attr("y", barTop)
        .attr("width", barWidth)
        .attr("height", BAR_HEIGHT)
        .attr("rx", 3)
        .attr("fill", pnlColorScale(pos.pnlPercent ?? 0))
        .attr("opacity", () => (currentHover === pos.positionId ? 1 : 0.8))
        .style("cursor", "pointer")
        .style("transition", "opacity 0.15s");

      rect
        .on("mouseenter", function (event) {
          hoveredPositionId = pos.positionId;
          tooltip = {
            show: true,
            x: event.clientX,
            y: event.clientY,
            symbol: group.symbol,
            openDate: pos.openDateTime,
            amount: pos.amount,
            pnl: pos.pnl,
            pnlPercent: pos.pnlPercent,
          };
        })
        .on("mousemove", function (event) {
          tooltip = {
            ...tooltip,
            x: event.clientX,
            y: event.clientY,
          };
        })
        .on("mouseleave", () => {
          hoveredPositionId = null;
          tooltip = { ...tooltip, show: false };
        });
    }

    // X-axis
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
  });
</script>

<div class="relative" bind:this={containerEl} style="height: {chartHeight}px">
  {#if tooltip.show}
    <div
      class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
      style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y +
        12}px; z-index: 50"
    >
      <div class="font-semibold text-text-primary">{tooltip.symbol}</div>
      <div class="mt-1 text-text-secondary">
        Opened: {dateFmt.format(new Date(tooltip.openDate))}
      </div>
      <div class="mt-0.5 text-text-secondary">
        Invested: <Money value={tooltip.amount} />
      </div>
      {#if tooltip.pnl !== undefined || tooltip.pnlPercent !== undefined}
        <div
          class="mt-0.5 {tooltip.pnl !== undefined && tooltip.pnl >= 0
            ? 'text-gain'
            : 'text-loss'}"
        >
          P&L: {#if tooltip.pnl !== undefined}
            <Money value={tooltip.pnl} showSign />
          {:else}
            —
          {/if}
          {#if tooltip.pnlPercent !== undefined}
            ({tooltip.pnlPercent >= 0 ? "+" : ""}{pctFmt.format(
              tooltip.pnlPercent,
            )}%)
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
