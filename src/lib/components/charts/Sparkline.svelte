<script lang="ts">
  import * as d3 from "d3";
  import { COLORS } from "$lib/chart-utils";
  import Money from "../Money.svelte";

  type DataPoint = { date: string; value: number };
  type Marker = { date: string; label?: string; amount?: number; units?: number; price?: number };

  let {
    data,
    width = 100,
    height = 28,
    markers = [],
  }: {
    data: DataPoint[];
    width?: number;
    height?: number;
    markers?: (string | Marker)[];
  } = $props();

  const uid = `sparkline-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

  let hoverIndex = $state<number | null>(null);
  let mouseX = $state(0);
  let mouseY = $state(0);
  let dragStartIndex = $state<number | null>(null);
  let dragEndIndex = $state<number | null>(null);
  let dragWasPerformed = $state(false);

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

  function toDateKey(s: string): string {
    return s.slice(0, 10);
  }

  function normalizeMarker(m: string | Marker): Marker {
    return typeof m === "string" ? { date: m } : m;
  }

  const markerMap = $derived.by(() => {
    const map = new Map<string, Marker[]>();
    for (const raw of markers) {
      const m = normalizeMarker(raw);
      const key = toDateKey(m.date);
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    return map;
  });

  const markerPoints = $derived.by(() => {
    if (!scales || markerMap.size === 0) return [];
    const pts: { cx: number; cy: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      if (markerMap.has(toDateKey(data[i].date))) {
        pts.push({ cx: scales.xScale(i), cy: scales.yScale(data[i].value) });
      }
    }
    return pts;
  });

  const hoverPoint = $derived.by(() => {
    if (hoverIndex === null || !scales) return null;
    const d = data[hoverIndex];
    const base = data[0].value;
    const pct = base !== 0 ? ((d.value - base) / base) * 100 : 0;
    const msPerDay = 86_400_000;
    const days = Math.round(
      (new Date(d.date).getTime() - new Date(data[0].date).getTime()) / msPerDay,
    );
    const dateKey = toDateKey(d.date);
    const markerInfo = markerMap.get(dateKey);
    return {
      cx: scales.xScale(hoverIndex),
      cy: scales.yScale(d.value),
      date: d3.timeFormat("%b %d, %Y")(new Date(d.date)),
      value: d.value,
      pct,
      days,
      isMarker: !!markerInfo,
      markers: markerInfo ?? [],
    };
  });

  const rangeTooltip = $derived.by(() => {
    if (
      dragStartIndex === null ||
      dragEndIndex === null ||
      !scales ||
      data.length < 2
    )
      return null;
    const [i0, i1] =
      dragStartIndex <= dragEndIndex
        ? [dragStartIndex, dragEndIndex]
        : [dragEndIndex, dragStartIndex];
    if (i0 === i1) return null;
    const start = data[i0];
    const end = data[i1];
    const pct =
      start.value !== 0 ? ((end.value - start.value) / start.value) * 100 : 0;
    const msPerDay = 86_400_000;
    const days = Math.round(
      (new Date(end.date).getTime() - new Date(start.date).getTime()) / msPerDay,
    );
    return {
      startDate: d3.timeFormat("%b %d, %Y")(new Date(start.date)),
      endDate: d3.timeFormat("%b %d, %Y")(new Date(end.date)),
      startValue: start.value,
      endValue: end.value,
      pct,
      days,
      x0: scales.xScale(i0),
      x1: scales.xScale(i1),
    };
  });

  const rangeAreaPath = $derived.by(() => {
    if (!rangeTooltip || !scales) return "";
    const { x0, x1 } = rangeTooltip;
    const i0 = Math.round(scales.xScale.invert(x0));
    const i1 = Math.round(scales.xScale.invert(x1));
    const [lo, hi] = i0 <= i1 ? [i0, i1] : [i1, i0];
    const slice = data.slice(lo, hi + 1);
    if (slice.length < 2) return "";
    const area = d3
      .area<DataPoint>()
      .x((_, i) => scales.xScale(lo + i))
      .y0(height)
      .y1((d) => scales.yScale(d.value))
      .curve(d3.curveMonotoneX);
    return area(slice) ?? "";
  });

  let containerEl = $state<HTMLElement | null>(null);

  function getIndexFromClientX(clientX: number): number {
    if (!scales || !containerEl) return 0;
    const rect = containerEl.getBoundingClientRect();
    const mx = clientX - rect.left;
    const idx = Math.round(scales.xScale.invert(mx));
    return Math.max(0, Math.min(data.length - 1, idx));
  }

  function getIndexFromEvent(e: MouseEvent): number {
    return getIndexFromClientX(e.clientX);
  }

  function onMouseDown(e: MouseEvent) {
    if (!scales) return;
    const idx = getIndexFromEvent(e);
    dragStartIndex = idx;
    dragEndIndex = idx;
    mouseX = e.clientX;
    mouseY = e.clientY;
  }

  function onMouseMove(e: MouseEvent) {
    if (!scales) return;
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (dragStartIndex !== null) {
      dragEndIndex = getIndexFromEvent(e);
    } else {
      const idx = getIndexFromEvent(e);
      hoverIndex = idx;
    }
  }

  function clearDrag() {
    const hadDrag =
      dragStartIndex !== null &&
      dragEndIndex !== null &&
      dragStartIndex !== dragEndIndex;
    dragStartIndex = null;
    dragEndIndex = null;
    if (hadDrag) dragWasPerformed = true;
  }

  function onClick(e: MouseEvent) {
    if (dragWasPerformed) {
      e.preventDefault();
      e.stopPropagation();
      dragWasPerformed = false;
    }
  }

  $effect(() => {
    if (dragStartIndex === null) return;
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dragEndIndex = getIndexFromClientX(e.clientX);
    };
    const onUp = () => clearDrag();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  });

  function onMouseLeave() {
    hoverIndex = null;
  }
</script>

{#if data.length >= 2}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
  <div
    bind:this={containerEl}
    class="relative inline-block cursor-crosshair select-none"
    role="img"
    aria-label="Price sparkline chart, drag to compare range"
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={clearDrag}
    onclick={onClick}
    onmouseleave={onMouseLeave}
  >
  <svg
    {width}
    {height}
    class="block"
  >
    <defs>
      <linearGradient id="sparkline-grad-{uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={color} stop-opacity="0.3" />
        <stop offset="100%" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={areaPath} fill="url(#sparkline-grad-{uid})" />
    {#if rangeAreaPath && rangeTooltip}
      <path
        d={rangeAreaPath}
        fill={rangeTooltip.pct >= 0 ? COLORS.gain : COLORS.loss}
        fill-opacity="0.25"
      />
    {/if}
    <path d={path} fill="none" stroke={color} stroke-width="1.5" />
    {#each markerPoints as m}
      <circle cx={m.cx} cy={m.cy} r="2" fill={COLORS.brand} stroke="var(--color-surface)" stroke-width="1" />
    {/each}
    {#if hoverPoint && dragStartIndex === null}
      <circle cx={hoverPoint.cx} cy={hoverPoint.cy} r="2.5" fill={color} />
    {/if}
  </svg>
  </div>
  {#if rangeTooltip}
    <div
      class="fixed whitespace-nowrap rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] shadow-lg pointer-events-none"
      style="left: {mouseX + 10}px; top: {mouseY - 32}px; z-index: 9999"
    >
      <span class="text-text-secondary"
        >{rangeTooltip.startDate} → {rangeTooltip.endDate}</span
      >
      <span class="ml-1 font-medium text-text-primary"
        ><Money value={rangeTooltip.startValue} public /> → <Money
          value={rangeTooltip.endValue}
          public
        /></span
      >
      <span
        class="ml-1 {rangeTooltip.pct >= 0 ? 'text-gain' : 'text-loss'}"
        >{rangeTooltip.pct >= 0 ? "+" : ""}{rangeTooltip.pct.toFixed(1)}%</span
      >
      <span class="ml-1 text-text-secondary">{rangeTooltip.days}d</span>
    </div>
  {:else if hoverPoint}
    <div
      class="fixed rounded-md border border-border bg-surface-raised px-2 py-1 text-[10px] shadow-lg pointer-events-none"
      style="left: {mouseX + 10}px; top: {mouseY - 32}px; z-index: 9999"
    >
      <div class="flex items-center gap-1 whitespace-nowrap">
        {#if hoverPoint.isMarker}
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-brand shrink-0"></span>
        {/if}
        <span class="text-text-secondary">{hoverPoint.date}</span>
        <span class="font-medium text-text-primary"
          ><Money value={hoverPoint.value} public /></span
        >
        <span class="{hoverPoint.pct >= 0 ? 'text-gain' : 'text-loss'}"
          >{hoverPoint.pct >= 0 ? "+" : ""}{hoverPoint.pct.toFixed(1)}%</span
        >
        <span class="text-text-secondary">{hoverPoint.days}d</span>
      </div>
      {#each hoverPoint.markers as m}
        {@const hasDetail = m.label || m.amount !== undefined || m.units !== undefined || m.price !== undefined}
        {#if hasDetail}
          <div class="flex items-center gap-1 whitespace-nowrap border-t border-border/30 pt-0.5 mt-0.5 text-brand">
            {#if m.label}<span class="font-medium">{m.label}</span>{/if}
            {#if m.price !== undefined}<span class="text-text-secondary">@</span><Money value={m.price} public />{/if}
            {#if m.units !== undefined}<span class="text-text-secondary">×</span><span data-private>{m.units.toFixed(m.units % 1 === 0 ? 0 : 4)}</span>{/if}
            {#if m.amount !== undefined}<span class="text-text-secondary">=</span><Money value={m.amount} />{/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
{:else}
  <span class="text-text-secondary text-[10px]">—</span>
{/if}
