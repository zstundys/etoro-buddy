<script lang="ts">
  import * as d3 from "d3";
  import { COLORS } from "$lib/chart-utils";
  import Money from "../Money.svelte";

  type DataPoint = { date: string; value: number };

  let {
    data,
    width = 100,
    height = 28,
  }: {
    data: DataPoint[];
    width?: number;
    height?: number;
  } = $props();

  let hoverIndex = $state<number | null>(null);
  let mouseX = $state(0);
  let mouseY = $state(0);

  const scales = $derived.by(() => {
    if (data.length < 2) return null;
    const values = data.map((d) => d.value);
    const xScale = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([1, width - 1]);
    const yExtent = d3.extent(values) as [number, number];
    const pad = (yExtent[1] - yExtent[0]) * 0.1 || 1;
    const yScale = d3
      .scaleLinear()
      .domain([yExtent[0] - pad, yExtent[1] + pad])
      .range([height - 1, 1]);
    return { xScale, yScale };
  });

  const path = $derived.by(() => {
    if (!scales) return "";
    const line = d3
      .line<DataPoint>()
      .x((_, i) => scales.xScale(i))
      .y((d) => scales.yScale(d.value))
      .curve(d3.curveMonotoneX);
    return line(data) ?? "";
  });

  const areaPath = $derived.by(() => {
    if (!scales) return "";
    const area = d3
      .area<DataPoint>()
      .x((_, i) => scales.xScale(i))
      .y0(height)
      .y1((d) => scales.yScale(d.value))
      .curve(d3.curveMonotoneX);
    return area(data) ?? "";
  });

  const color = $derived(
    data.length >= 2 && data[data.length - 1].value >= data[0].value
      ? COLORS.gain
      : COLORS.loss,
  );

  const hoverPoint = $derived.by(() => {
    if (hoverIndex === null || !scales) return null;
    const d = data[hoverIndex];
    const base = data[0].value;
    const pct = base !== 0 ? ((d.value - base) / base) * 100 : 0;
    return {
      cx: scales.xScale(hoverIndex),
      cy: scales.yScale(d.value),
      date: d3.timeFormat("%b %d")(new Date(d.date)),
      value: d.value,
      pct,
    };
  });

  function onMouseMove(e: MouseEvent) {
    if (!scales) return;
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.round(scales.xScale.invert(mx));
    hoverIndex = Math.max(0, Math.min(data.length - 1, idx));
    mouseX = e.clientX;
    mouseY = e.clientY;
  }
</script>

{#if data.length >= 2}
  <svg
    {width}
    {height}
    class="block cursor-crosshair"
    role="img"
    onmousemove={onMouseMove}
    onmouseleave={() => (hoverIndex = null)}
  >
    <defs>
      <linearGradient id="sparkline-grad-{color}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={color} stop-opacity="0.3" />
        <stop offset="100%" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={areaPath} fill="url(#sparkline-grad-{color})" />
    <path d={path} fill="none" stroke={color} stroke-width="1.5" />
    {#if hoverPoint}
      <circle cx={hoverPoint.cx} cy={hoverPoint.cy} r="2.5" fill={color} />
    {/if}
  </svg>
  {#if hoverPoint}
    <div
      class="fixed whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] shadow-lg pointer-events-none"
      style="left: {mouseX + 10}px; top: {mouseY - 32}px; z-index: 9999"
    >
      <span class="text-text-secondary">{hoverPoint.date}</span>
      <span class="ml-1 font-medium text-text-primary"
        ><Money value={hoverPoint.value} public /></span
      >
      <span class="ml-1 {hoverPoint.pct >= 0 ? 'text-gain' : 'text-loss'}"
        >{hoverPoint.pct >= 0 ? "+" : ""}{hoverPoint.pct.toFixed(1)}%</span
      >
    </div>
  {/if}
{:else}
  <span class="text-text-secondary text-[10px]">—</span>
{/if}
