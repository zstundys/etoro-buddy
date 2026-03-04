<script lang="ts">
  import * as d3 from "d3";
  import { COLORS } from "$lib/chart-utils";
  import { currency as currFmt, percent as pctFmt } from "$lib/format";
  import {
    type BucketComputed,
    bucketColor,
  } from "./target-allocation.svelte.ts";

  let {
    buckets,
    totalTargetPercent,
  }: {
    buckets: BucketComputed[];
    totalTargetPercent: number;
  } = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let svgEl: SVGSVGElement | undefined = $state();
  let width = $state(0);

  type TooltipData = {
    show: boolean;
    x: number;
    y: number;
    name: string;
    target: number;
    actual: number;
    delta: number;
    symbol?: string;
    marketValue?: number;
    weightInBucket?: number;
  };

  let tooltip = $state<TooltipData>({
    show: false,
    x: 0,
    y: 0,
    name: "",
    target: 0,
    actual: 0,
    delta: 0,
  });

  const SIZE = 300;
  const OUTER_R = SIZE / 2 - 16;
  const INNER_R = OUTER_R * 0.55;
  const HOLDINGS_RING_WIDTH = 8;
  const HOLDINGS_OUTER_R = INNER_R - 1;
  const HOLDINGS_INNER_R = HOLDINGS_OUTER_R - HOLDINGS_RING_WIDTH;
  const MAX_OVERFLOW = 14;
  const TARGET_AREA = OUTER_R * OUTER_R - INNER_R * INNER_R;

  function actualOuterR(bucket: BucketComputed): number {
    if (bucket.targetPercent <= 0) return INNER_R;
    const ratio = bucket.actualPercent / bucket.targetPercent;
    const clamped = Math.max(0, Math.min(ratio, 1));
    const r = Math.sqrt(INNER_R * INNER_R + clamped * TARGET_AREA);
    const overflow =
      ratio > 1
        ? Math.min(Math.sqrt(ratio - 1) * MAX_OVERFLOW, MAX_OVERFLOW)
        : 0;
    return r + overflow;
  }

  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) width = e.contentRect.width;
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!svgEl || buckets.length === 0) return;

    const validBuckets = buckets.filter((b) => b.targetPercent > 0);
    if (validBuckets.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const g = svg
      .append("g")
      .attr("transform", `translate(${SIZE / 2},${SIZE / 2})`);

    const pie = d3
      .pie<BucketComputed>()
      .value((d) => d.targetPercent)
      .sort(null)
      .padAngle(0.02);

    const arcs = pie(validBuckets);

    const targetArc = d3
      .arc<d3.PieArcDatum<BucketComputed>>()
      .innerRadius(INNER_R)
      .outerRadius(OUTER_R)
      .cornerRadius(3);

    g.selectAll("path.target-slice")
      .data(arcs)
      .join("path")
      .attr("class", "target-slice")
      .attr("d", targetArc)
      .attr("fill", (d, i) => bucketColor(d.data, i))
      .attr("opacity", 0.25)
      .attr("stroke", COLORS.surface)
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        tooltip = {
          show: true,
          x: event.clientX,
          y: event.clientY,
          name: d.data.name || "Unnamed",
          target: d.data.targetPercent,
          actual: d.data.actualPercent,
          delta: d.data.delta,
        };
      })
      .on("mousemove", (event) => {
        tooltip.x = event.clientX;
        tooltip.y = event.clientY;
      })
      .on("mouseleave", () => {
        tooltip.show = false;
      });

    const actualGroup = g.append("g").style("mix-blend-mode", "color-dodge");

    for (let i = 0; i < arcs.length; i++) {
      const d = arcs[i];
      const bucket = d.data;
      const aR = actualOuterR(bucket);

      if (aR <= INNER_R) continue;

      const overlayArc = d3
        .arc<d3.PieArcDatum<BucketComputed>>()
        .innerRadius(INNER_R)
        .outerRadius(aR)
        .cornerRadius(3);

      actualGroup
        .append("path")
        .datum(d)
        .attr("d", overlayArc)
        .attr("fill", bucketColor(bucket, i))
        .attr("opacity", 0.75)
        .attr("stroke", COLORS.surface)
        .attr("stroke-width", 1)
        .style("cursor", "pointer")
        .on("mouseenter", (event) => {
          tooltip = {
            show: true,
            x: event.clientX,
            y: event.clientY,
            name: bucket.name || "Unnamed",
            target: bucket.targetPercent,
            actual: bucket.actualPercent,
            delta: bucket.delta,
          };
        })
        .on("mousemove", (event) => {
          tooltip.x = event.clientX;
          tooltip.y = event.clientY;
        })
        .on("mouseleave", () => {
          tooltip.show = false;
        });
    }

    // Inner holdings ring: subdivide each bucket's arc among its symbols.
    // d3's padAngle produces a pixel gap of (padAngle * r) at radius r.
    // The outer donut's gap at INNER_R (where the two rings visually meet)
    // is (0.02 * INNER_R) px. To match that same pixel gap at the holdings
    // ring radius we scale: holdingsPad = outerPad * INNER_R / HOLDINGS_OUTER_R.
    const holdingsGroup = g.append("g");
    const OUTER_PAD = 0.02;
    const BUCKET_PAD = OUTER_PAD * (INNER_R / HOLDINGS_OUTER_R);
    const SYM_PAD_PX = 1;
    const SYM_PAD = SYM_PAD_PX / HOLDINGS_OUTER_R;

    const holdingsArc = d3
      .arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(HOLDINGS_INNER_R)
      .outerRadius(HOLDINGS_OUTER_R)
      .cornerRadius(1);

    for (let i = 0; i < arcs.length; i++) {
      const d = arcs[i];
      const bucket = d.data;
      const symbols = bucket.symbolDetails.filter((s) => s.marketValue > 0);
      if (symbols.length === 0) continue;

      const bucketTotal = symbols.reduce((s, sym) => s + sym.marketValue, 0);
      const baseColor = d3.color(bucketColor(bucket, i))!;

      const halfPad = BUCKET_PAD / 2;
      const innerStart = d.startAngle + halfPad;
      const innerEnd = d.endAngle - halfPad;
      const usableSpan = innerEnd - innerStart;
      if (usableSpan <= 0) continue;

      if (symbols.length === 1) {
        const sym = symbols[0];
        holdingsGroup
          .append("path")
          .attr("d", holdingsArc({ startAngle: innerStart, endAngle: innerEnd }))
          .attr("fill", baseColor.brighter(0.5).formatHex())
          .attr("opacity", 0.6)
          .attr("stroke", COLORS.surface)
          .attr("stroke-width", 0.5)
          .style("cursor", "pointer")
          .on("mouseenter", (event) => {
            tooltip = {
              show: true,
              x: event.clientX,
              y: event.clientY,
              name: bucket.name || "Unnamed",
              target: bucket.targetPercent,
              actual: bucket.actualPercent,
              delta: bucket.delta,
              symbol: sym.symbol,
              marketValue: sym.marketValue,
              weightInBucket: sym.weight,
            };
          })
          .on("mousemove", (event) => {
            tooltip.x = event.clientX;
            tooltip.y = event.clientY;
          })
          .on("mouseleave", () => {
            tooltip.show = false;
          });
        continue;
      }

      const totalSymPad = SYM_PAD * (symbols.length - 1);
      const drawableSpan = usableSpan - totalSymPad;
      if (drawableSpan <= 0) continue;

      let cursor = innerStart;
      for (let j = 0; j < symbols.length; j++) {
        const sym = symbols[j];
        const fraction = sym.marketValue / bucketTotal;
        const symAngle = fraction * drawableSpan;
        const sa = cursor;
        const ea = cursor + symAngle;
        cursor = ea + (j < symbols.length - 1 ? SYM_PAD : 0);

        if (ea <= sa) continue;

        const shade = baseColor.brighter(0.3 + (j % 3) * 0.4);

        holdingsGroup
          .append("path")
          .attr("d", holdingsArc({ startAngle: sa, endAngle: ea }))
          .attr("fill", shade.formatHex())
          .attr("opacity", 0.6)
          .attr("stroke", COLORS.surface)
          .attr("stroke-width", 0.5)
          .style("cursor", "pointer")
          .on("mouseenter", (event) => {
            tooltip = {
              show: true,
              x: event.clientX,
              y: event.clientY,
              name: bucket.name || "Unnamed",
              target: bucket.targetPercent,
              actual: bucket.actualPercent,
              delta: bucket.delta,
              symbol: sym.symbol,
              marketValue: sym.marketValue,
              weightInBucket: sym.weight,
            };
          })
          .on("mousemove", (event) => {
            tooltip.x = event.clientX;
            tooltip.y = event.clientY;
          })
          .on("mouseleave", () => {
            tooltip.show = false;
          });
      }
    }

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .attr("fill", COLORS.textPrimary)
      .attr("font-size", "22px")
      .attr("font-weight", "600")
      .text(`${Math.round(totalTargetPercent)}%`);

    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.3em")
      .attr("fill", COLORS.textSecondary)
      .attr("font-size", "11px")
      .text("target total");
  });
</script>

<div class="flex shrink-0 flex-col items-center gap-1">
  <div
    bind:this={containerEl}
    class="relative"
    style="width:{SIZE}px;height:{SIZE}px;"
  >
    <svg bind:this={svgEl} width={SIZE} height={SIZE} class="overflow-visible"
    ></svg>
    {#if tooltip.show}
      <div
        class="pointer-events-none fixed z-50 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg"
        style="left:{tooltip.x + 12}px;top:{tooltip.y - 10}px;"
      >
        {#if tooltip.symbol}
          <div class="font-medium text-text-primary">{tooltip.symbol}</div>
          <div class="mt-0.5 text-[10px] text-text-secondary/70">{tooltip.name}</div>
          <div class="mt-1 text-text-secondary" data-private>
            {currFmt.format(tooltip.marketValue ?? 0)}
          </div>
          <div class="text-text-secondary">
            {pctFmt.format(tooltip.weightInBucket ?? 0)}% of bucket
          </div>
        {:else}
          <div class="font-medium text-text-primary">{tooltip.name}</div>
          <div class="mt-1 text-text-secondary">
            Target: {pctFmt.format(tooltip.target)}%
          </div>
          <div class="text-text-secondary">
            Actual: {pctFmt.format(tooltip.actual)}%
          </div>
          <div class={tooltip.delta >= 0 ? "text-gain" : "text-loss"}>
            {tooltip.delta >= 0 ? "+" : ""}{pctFmt.format(tooltip.delta)}%
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <div
    class="text-center text-[10px] text-text-secondary text-pretty"
    style="max-width:{SIZE}px;"
  >
    Faded = target &middot; Filled = actual (taller = overweight, shorter =
    underweight)
  </div>
</div>
