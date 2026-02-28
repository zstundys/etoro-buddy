<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition } from "$lib/etoro-api";
  import { COLORS, pnlColorScale, groupBySymbol } from "$lib/chart-utils";
  import { currency as fmt, percent as pctFmt } from "$lib/format";

  interface LeafData {
    name: string;
    totalAmount: number;
    totalPnl: number;
    avgPnlPct: number;
    count: number;
  }
  interface SectorData {
    name: string;
    isSector: true;
    totalAmount: number;
    totalPnl: number;
    avgPnlPct: number;
    symbolCount: number;
    children: LeafData[];
  }
  interface RootData {
    name: string;
    children: (LeafData | SectorData)[];
  }
  type NodeData = RootData | SectorData | LeafData;
  type RectNode = d3.HierarchyRectangularNode<NodeData>;

  let {
    positions,
    sectorMap = new Map(),
  }: {
    positions: EnrichedPosition[];
    sectorMap?: Map<number, string>;
  } = $props();

  const useSectors = $derived(sectorMap.size > 0);

  let containerEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let tooltip = $state<{
    show: boolean;
    x: number;
    y: number;
    name: string;
    amount: number;
    pnl: number;
    pnlPercent: number;
    count: number;
    label?: string;
  }>({
    show: false,
    x: 0,
    y: 0,
    name: "",
    amount: 0,
    pnl: 0,
    pnlPercent: 0,
    count: 0,
  });

  const HEIGHT = 350;
  const MIN_LABEL_W = 44;
  const MIN_LABEL_H = 22;
  const MIN_AMOUNT_H = 36;
  const SECTOR_PAD_TOP = 18;

  const sectorColorScale = d3.scaleOrdinal(d3.schemeTableau10);

  function isSector(d: NodeData): d is SectorData {
    return "isSector" in d;
  }

  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) width = e.contentRect.width;
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!containerEl || width <= 0 || positions.length === 0) return;
    const _useSectors = useSectors;
    const _sectorMap = sectorMap;

    const groups = groupBySymbol(positions);

    let rootData: RootData;

    if (_useSectors) {
      const sectorGroups = new Map<string, typeof groups>();
      for (const g of groups) {
        const firstPos = g.positions[0];
        const sectorName = firstPos
          ? (_sectorMap.get(firstPos.instrumentId) ?? "Other")
          : "Other";
        if (!sectorGroups.has(sectorName)) sectorGroups.set(sectorName, []);
        sectorGroups.get(sectorName)!.push(g);
      }

      rootData = {
        name: "root",
        children: [...sectorGroups.entries()].map(([name, syms]) => {
          const totalAmount = syms.reduce((s, g) => s + g.totalAmount, 0);
          const totalPnl = syms.reduce((s, g) => s + g.totalPnl, 0);
          return {
            name,
            isSector: true as const,
            totalAmount,
            totalPnl,
            avgPnlPct: totalAmount > 0 ? (totalPnl / totalAmount) * 100 : 0,
            symbolCount: syms.length,
            children: syms.map((g) => ({
              name: g.symbol,
              totalAmount: g.totalAmount,
              totalPnl: g.totalPnl,
              avgPnlPct: g.avgPnlPct,
              count: g.positions.length,
            })),
          } as SectorData;
        }),
      };
    } else {
      rootData = {
        name: "root",
        children: groups.map((g) => ({
          name: g.symbol,
          totalAmount: g.totalAmount,
          totalPnl: g.totalPnl,
          avgPnlPct: g.avgPnlPct,
          count: g.positions.length,
        })),
      };
    }

    const root = d3
      .hierarchy<NodeData>(rootData)
      .sum((d) =>
        "count" in d && !isSector(d) ? (d as LeafData).totalAmount : 0,
      )
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const treemap = d3
      .treemap<NodeData>()
      .tile(d3.treemapSquarify)
      .size([width, HEIGHT])
      .paddingInner(2)
      .round(true);

    if (_useSectors) {
      treemap.paddingTop((d: RectNode) => (d.depth === 1 ? SECTOR_PAD_TOP : 0));
    }

    treemap(root);

    const leaves = root.leaves() as RectNode[];

    let svg = d3.select(containerEl).select<SVGSVGElement>("svg");
    if (svg.empty()) {
      svg = d3.select(containerEl).append("svg");
    }
    svg.attr("width", width).attr("height", HEIGHT);
    svg.selectAll("*").remove();

    if (_useSectors) {
      const sectors = (root.children ?? []) as RectNode[];

      const sg = svg
        .selectAll<SVGGElement, RectNode>("g.sector-group")
        .data(sectors, (d) => d.data.name)
        .join("g")
        .attr("class", "sector-group")
        .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

      sg.append("rect")
        .attr("width", (d) => Math.max(0, d.x1 - d.x0))
        .attr("height", (d) => Math.max(0, d.y1 - d.y0))
        .attr("rx", 4)
        .attr("fill", (d) => {
          const c = d3.color(sectorColorScale(d.data.name));
          if (c) {
            c.opacity = 0.1;
            return c.formatRgb();
          }
          return "transparent";
        })
        .attr("stroke", (d) => {
          const c = d3.color(sectorColorScale(d.data.name));
          if (c) {
            c.opacity = 0.3;
            return c.formatRgb();
          }
          return "transparent";
        })
        .attr("stroke-width", 1)
        .on("mouseenter", function (event, d) {
          const data = d.data;
          if (!isSector(data)) return;
          tooltip = {
            show: true,
            x: event.clientX,
            y: event.clientY,
            name: data.name,
            amount: data.totalAmount,
            pnl: data.totalPnl,
            pnlPercent: data.avgPnlPct,
            count: data.symbolCount,
            label: "Sector",
          };
        })
        .on("mousemove", function (event) {
          tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
        })
        .on("mouseleave", () => {
          tooltip = { ...tooltip, show: false };
        });

      sg.append("text")
        .attr("x", 4)
        .attr("y", 13)
        .attr("fill", (d) => sectorColorScale(d.data.name))
        .attr("font-size", 10)
        .attr("font-weight", 600)
        .style("pointer-events", "none")
        .text((d) => {
          const w = d.x1 - d.x0;
          return w > 40 ? d.data.name : "";
        });
    }

    const tile = svg
      .selectAll<SVGGElement, RectNode>("g.tile")
      .data(leaves, (d) => d.data.name)
      .join("g")
      .attr("class", "tile")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    tile
      .append("rect")
      .attr("width", (d) => Math.max(0, d.x1 - d.x0))
      .attr("height", (d) => Math.max(0, d.y1 - d.y0))
      .attr("rx", 3)
      .attr("fill", (d) => pnlColorScale((d.data as LeafData).avgPnlPct))
      .style("cursor", "pointer");

    tile
      .append("text")
      .attr("x", 5)
      .attr("y", 15)
      .attr("fill", COLORS.textPrimary)
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .style("pointer-events", "none")
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        return w >= MIN_LABEL_W && h >= MIN_LABEL_H ? d.data.name : "";
      });

    tile
      .append("text")
      .attr("x", 5)
      .attr("y", 28)
      .attr("fill", "rgba(0,0,0,0.55)")
      .attr("font-size", 10)
      .style("pointer-events", "none")
      .text((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        return w >= MIN_LABEL_W && h >= MIN_AMOUNT_H
          ? fmt.format((d.data as LeafData).totalAmount)
          : "";
      });

    tile
      .on("mouseenter", function (event, d) {
        const data = d.data as LeafData;
        tooltip = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          name: data.name,
          amount: data.totalAmount,
          pnl: data.totalPnl,
          pnlPercent: data.avgPnlPct,
          count: data.count,
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
      class="pointer-events-none fixed rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-xl"
      style="left: {tooltip.x + 12}px; top: {tooltip.y + 12}px; z-index: 50"
    >
      {#if tooltip.label}
        <div class="text-[10px] uppercase tracking-wider text-text-secondary">
          {tooltip.label}
        </div>
      {/if}
      <div class="font-semibold text-text-primary">{tooltip.name}</div>
      <div class="mt-1 text-text-secondary">
        {tooltip.count}
        {tooltip.label === "Sector" ? "symbol" : "position"}{tooltip.count !== 1
          ? "s"
          : ""}
      </div>
      <div class="mt-0.5 text-text-secondary">
        Invested: {fmt.format(tooltip.amount)}
      </div>
      <div class="mt-0.5 {tooltip.pnl >= 0 ? 'text-gain' : 'text-loss'}">
        P&L: {tooltip.pnl >= 0 ? "+" : ""}{fmt.format(tooltip.pnl)}
        ({tooltip.pnlPercent >= 0 ? "+" : ""}{pctFmt.format(
          tooltip.pnlPercent,
        )}%)
      </div>
    </div>
  {/if}
</div>
