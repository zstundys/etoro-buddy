<script lang="ts">
  import * as d3 from "d3";
  import type { EnrichedPosition } from "$lib/etoro-api";
  import { COLORS, symbolColor } from "$lib/chart-utils";
  import { normalizeSymbol } from "$lib/format";
  import Money from "../Money.svelte";

  let {
    positions,
    colorMap = new Map(),
  }: {
    positions: EnrichedPosition[];
    colorMap?: Map<string, string>;
  } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let hoveredRibbon = $state<{ sourceIdx: number; targetIdx: number } | null>(
    null,
  );
  let hoveredArc = $state<number | null>(null);
  type RibbonTip = {
    kind: "ribbon";
    month: string;
    symbol: string;
    amount: number;
  };
  type ArcTip = {
    kind: "arc";
    label: string;
    isMonth: boolean;
    total: number;
    connections: { label: string; amount: number }[];
  };

  let tooltip = $state<{
    show: boolean;
    x: number;
    y: number;
    data: RibbonTip | ArcTip | null;
  }>({ show: false, x: 0, y: 0, data: null });

  const MAX_SIZE = 500;
  const INNER_RADIUS_RATIO = 0.8;
  const LABEL_ANGLE_THRESHOLD = 0.15;
  const monthFormat = d3.timeFormat("%b %Y");

  const hasEnoughData = $derived.by(() => {
    const withDate = positions.filter((p) => p.openDateTime);
    if (withDate.length === 0) return false;
    const dates = withDate.map((p) => new Date(p.openDateTime!).getTime());
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    const d1 = new Date(min);
    const d2 = new Date(max);
    const months =
      (d2.getFullYear() - d1.getFullYear()) * 12 +
      (d2.getMonth() - d1.getMonth()) +
      1;
    return months >= 2;
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

    const positionsWithDate = positions.filter(
      (p) => p.openDateTime && p.amount != null,
    );
    if (positionsWithDate.length === 0) {
      d3.select(containerEl).selectAll("*").remove();
      return;
    }

    const minDate = d3.min(
      positionsWithDate,
      (p) => new Date(p.openDateTime!),
    )!;
    const maxDate = d3.max(
      positionsWithDate,
      (p) => new Date(p.openDateTime!),
    )!;
    const months = d3.timeMonth.range(
      d3.timeMonth.floor(minDate),
      d3.timeMonth.offset(maxDate, 1),
    );

    if (months.length < 2) {
      d3.select(containerEl).selectAll("*").remove();
      return;
    }

    // Build month → symbol capital matrix
    const bySymbol = new Map<string, EnrichedPosition[]>();
    for (const p of positionsWithDate) {
      const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(p);
    }
    const symbols = [...bySymbol.keys()];

    const monthToIdx = new Map<number, number>();
    months.forEach((m, i) => monthToIdx.set(m.getTime(), i));
    const symbolToIdx = new Map<string, number>();
    symbols.forEach((s, i) => symbolToIdx.set(s, i));

    // matrix[monthIdx][symbolIdx] = capital from month into symbol
    const rawMonthSymbolMatrix: number[][] = months.map(() =>
      symbols.map(() => 0),
    );
    for (const p of positionsWithDate) {
      const d = new Date(p.openDateTime!);
      const monthStart = d3.timeMonth.floor(d);
      const monthIdx = monthToIdx.get(monthStart.getTime());
      const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
      const symbolIdx = symbolToIdx.get(sym);
      if (monthIdx != null && symbolIdx != null) {
        rawMonthSymbolMatrix[monthIdx][symbolIdx] += p.amount;
      }
    }

    // Filter out months with no capital
    const activeMonthIndices = months
      .map((_, i) => i)
      .filter((i) => rawMonthSymbolMatrix[i].some((v) => v > 0));
    const activeMonths = activeMonthIndices.map((i) => months[i]);
    const monthSymbolMatrix = activeMonthIndices.map(
      (i) => rawMonthSymbolMatrix[i],
    );

    if (activeMonths.length < 2) {
      d3.select(containerEl).selectAll("*").remove();
      return;
    }

    // Build square matrix for chord: [activeMonths..., symbols...], n = activeMonths.length + symbols.length
    const n = activeMonths.length + symbols.length;
    const matrix: number[][] = Array.from({ length: n }, () =>
      Array(n).fill(0),
    );
    for (let mi = 0; mi < activeMonths.length; mi++) {
      for (let si = 0; si < symbols.length; si++) {
        matrix[mi][activeMonths.length + si] = monthSymbolMatrix[mi][si];
      }
    }

    const chordLayout = d3.chordDirected().padAngle(0.02);
    const chordResult = chordLayout(matrix);
    const chords = chordResult as d3.Chord[];
    const groups = (chordResult as { groups: d3.ChordGroup[] }).groups;

    const size = Math.min(width, MAX_SIZE);
    const outerRadius = size / 2;
    const innerRadius = outerRadius * INNER_RADIUS_RATIO;

    const monthColorScale = d3
      .scaleSequential(d3.interpolateHcl("#4a90d9", "#e8a87c"))
      .domain([0, Math.max(1, activeMonths.length - 1)]);

    const arc = d3
      .arc<d3.ChordGroup>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    const ribbon = d3.ribbon<d3.Chord, d3.ChordSubgroup>().radius(outerRadius);

    // Metadata for labels and tooltips
    const groupLabels: string[] = [
      ...activeMonths.map((m) => monthFormat(m)),
      ...symbols,
    ];
    const groupColors: string[] = [
      ...activeMonths.map((_, i) => monthColorScale(i)),
      ...symbols.map((s) => symbolColor(s, colorMap)),
    ];

    // Chord metadata for tooltips
    const chordMeta = chords.map((c) => ({
      sourceIdx: c.source.index,
      targetIdx: c.target.index,
      month: groupLabels[c.source.index],
      symbol: groupLabels[c.target.index],
      amount: c.source.value,
    }));

    // Arc metadata: for each group, compute total and its connections
    const arcMeta = groups.map((grp) => {
      const idx = grp.index;
      const isMonth = idx < activeMonths.length;
      const connections: { label: string; amount: number }[] = [];
      for (const cm of chordMeta) {
        if (cm.sourceIdx === idx)
          connections.push({ label: cm.symbol, amount: cm.amount });
        else if (cm.targetIdx === idx)
          connections.push({ label: cm.month, amount: cm.amount });
      }
      connections.sort((a, b) => b.amount - a.amount);
      return {
        label: groupLabels[idx],
        isMonth,
        total: connections.reduce((s, c) => s + c.amount, 0),
        connections,
      };
    });

    const currentHoverRibbon = hoveredRibbon;
    const currentHoverArc = hoveredArc;

    function isRibbonHighlighted(c: d3.Chord): boolean {
      if (currentHoverArc != null) {
        return (
          c.source.index === currentHoverArc ||
          c.target.index === currentHoverArc
        );
      }
      if (currentHoverRibbon) {
        return (
          (c.source.index === currentHoverRibbon.sourceIdx &&
            c.target.index === currentHoverRibbon.targetIdx) ||
          (c.source.index === currentHoverRibbon.targetIdx &&
            c.target.index === currentHoverRibbon.sourceIdx)
        );
      }
      return true;
    }

    function getRibbonOpacity(c: d3.Chord): number {
      return isRibbonHighlighted(c) ? 1 : 0.15;
    }

    function getRibbonColor(c: d3.Chord): string {
      return groupColors[c.source.index];
    }

    // Add radius to chord subgroups for ribbon (chord layout doesn't include it)
    const chordsWithRadius = chords.map((c) => ({
      source: { ...c.source, radius: outerRadius },
      target: { ...c.target, radius: outerRadius },
    }));

    const labelPad = 50;
    const viewSize = size + labelPad * 2;

    let svg = d3.select(containerEl).select<SVGSVGElement>("svg");
    if (svg.empty()) {
      svg = d3.select(containerEl).append("svg");
    }
    svg
      .attr("width", viewSize)
      .attr("height", viewSize)
      .attr("viewBox", `${-labelPad} ${-labelPad} ${viewSize} ${viewSize}`);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${outerRadius},${outerRadius})`);

    // Ribbons (drawn first so arcs sit on top)
    type ChordWithRadius = (typeof chordsWithRadius)[0];

    g.selectAll<SVGPathElement, ChordWithRadius>("path.ribbon")
      .data(chordsWithRadius, (c) => `${c.source.index}-${c.target.index}`)
      .join("path")
      .attr("class", "ribbon")
      .attr("d", (d) => ribbon(d) ?? "")
      .attr("fill", (c) => getRibbonColor(c as unknown as d3.Chord))
      .attr("stroke", COLORS.border)
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .style("opacity", (c) => getRibbonOpacity(c as unknown as d3.Chord))
      .on("mouseenter", function (event: MouseEvent, d: ChordWithRadius) {
        const meta = chordMeta.find(
          (m) =>
            (m.sourceIdx === d.source.index &&
              m.targetIdx === d.target.index) ||
            (m.sourceIdx === d.target.index && m.targetIdx === d.source.index),
        );
        if (meta) {
          hoveredRibbon = {
            sourceIdx: d.source.index,
            targetIdx: d.target.index,
          };
          tooltip = {
            show: true,
            x: event.clientX,
            y: event.clientY,
            data: {
              kind: "ribbon",
              month: meta.month,
              symbol: meta.symbol,
              amount: meta.amount,
            },
          };
        }
      })
      .on("mousemove", function (event: MouseEvent) {
        tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
      })
      .on("mouseleave", () => {
        hoveredRibbon = null;
        tooltip = { ...tooltip, show: false };
      });

    // Arcs
    g.selectAll<SVGPathElement, d3.ChordGroup>("path.arc")
      .data(groups)
      .join("path")
      .attr("class", "arc")
      .attr("d", (d) => arc(d) ?? "")
      .attr("fill", (_d: d3.ChordGroup, i: number) => groupColors[i])
      .attr("stroke", COLORS.border)
      .attr("stroke-width", 1)
      .style("cursor", "pointer")
      .on("mouseenter", function (event: MouseEvent, d: d3.ChordGroup) {
        hoveredArc = d.index;
        hoveredRibbon = null;
        const meta = arcMeta[d.index];
        tooltip = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          data: { kind: "arc", ...meta },
        };
      })
      .on("mousemove", function (event: MouseEvent) {
        tooltip = { ...tooltip, x: event.clientX, y: event.clientY };
      })
      .on("mouseleave", () => {
        hoveredArc = null;
        tooltip = { ...tooltip, show: false };
      });

    // Arc labels
    const labelGroups = groups.filter(
      (grp) => grp.endAngle - grp.startAngle > LABEL_ANGLE_THRESHOLD,
    );

    g.selectAll<SVGTextElement, d3.ChordGroup>("text.arc-label")
      .data(labelGroups)
      .join("text")
      .attr("class", "arc-label")
      .style("pointer-events", "none")
      .attr("dy", -outerRadius - 6)
      .attr("text-anchor", (d: d3.ChordGroup) => {
        const mid = (d.startAngle + d.endAngle) / 2;
        return mid > Math.PI / 2 && mid < (3 * Math.PI) / 2 ? "end" : "start";
      })
      .attr("transform", (d: d3.ChordGroup) => {
        const mid = (d.startAngle + d.endAngle) / 2;
        return `rotate(${(mid * 180) / Math.PI})`;
      })
      .attr("fill", COLORS.textPrimary)
      .attr("font-size", 10)
      .text((d: d3.ChordGroup) => groupLabels[d.index]);
  });
</script>

<div class="relative flex min-h-[300px] w-full justify-center">
  <div bind:this={containerEl} class="w-full max-w-[500px] aspect-square"></div>
  {#if !hasEnoughData}
    <div
      class="absolute inset-0 flex items-center justify-center text-text-secondary pointer-events-none"
    >
      Need at least 2 months of data
    </div>
  {/if}
  {#if tooltip.show && tooltip.data}
    <div
      class="bg-surface-raised border border-border rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
      style="position: fixed; left: {tooltip.x + 12}px; top: {tooltip.y +
        12}px; z-index: 50; max-width: 220px"
    >
      {#if tooltip.data.kind === "ribbon"}
        <div class="font-semibold text-text-primary">
          {tooltip.data.month} → {tooltip.data.symbol}
        </div>
        <div class="mt-1 text-text-secondary">
          Amount: <Money value={tooltip.data.amount} />
        </div>
      {:else}
        <div class="font-semibold text-text-primary">{tooltip.data.label}</div>
        <div class="mt-0.5 text-text-secondary">
          Total: <Money value={tooltip.data.total} />
        </div>
        {#if tooltip.data.connections.length > 0}
          <div class="mt-1.5 border-t border-border pt-1.5">
            {#each tooltip.data.connections.slice(0, 6) as conn (conn.label)}
              <div class="mt-0.5 flex items-center justify-between gap-3">
                <span class="text-text-secondary truncate"
                  >{tooltip.data.isMonth ? "→" : "←"} {conn.label}</span
                >
                <span class="shrink-0 text-text-primary"
                  ><Money value={conn.amount} /></span
                >
              </div>
            {/each}
            {#if tooltip.data.connections.length > 6}
              <div class="mt-0.5 text-text-secondary">
                +{tooltip.data.connections.length - 6} more
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
