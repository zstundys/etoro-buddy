<script lang="ts">
	import { shortDate as dateFmt } from '$lib/format';

	type Props = {
		minDate: Date;
		maxDate: Date;
		startDate: Date;
		endDate: Date;
		onchange: (start: Date, end: Date) => void;
		minimal?: boolean;
		defaultPick?: string;
	};

	let { minDate, maxDate, startDate, endDate, onchange, minimal = false, defaultPick }: Props = $props();

	const msPerDay = 86_400_000;

	function floorUtcDay(d: Date): number {
		return Math.floor(d.getTime() / msPerDay);
	}

	const anchorDay = $derived(floorUtcDay(minDate));
	const totalDays = $derived(floorUtcDay(maxDate) - anchorDay);

	function dateToDay(d: Date): number {
		return floorUtcDay(d) - anchorDay;
	}

	function dayToDate(day: number): Date {
		return new Date((anchorDay + day) * msPerDay);
	}

	function toIso(d: Date): string {
		return d.toISOString().slice(0, 10);
	}

	const accountStatementUrl = $derived(
		`https://www.etoro.com/documents/accountstatement/${toIso(startDate)}/${toIso(endDate)}`
	);

	let startDay = $derived(dateToDay(startDate));
	let endDay = $derived(dateToDay(endDate));

	const trackLeft = $derived(totalDays > 0 ? (startDay / totalDays) * 100 : 0);
	const trackRight = $derived(totalDays > 0 ? ((totalDays - endDay) / totalDays) * 100 : 0);

	const SNAP_PX = 5;

	function jan1Utc(y: number): Date {
		return new Date(Date.UTC(y, 0, 1));
	}

	function pickYear(y: number) {
		const start = jan1Utc(y);
		const end = jan1Utc(y + 1);
		const clampedStart = start < minDate ? minDate : start;
		const clampedEnd = end > maxDate ? maxDate : dayToDate(dateToDay(end) - 1);
		onchange(clampedStart, clampedEnd);
	}

	function isActiveYear(y: number): boolean {
		const expectedStart = jan1Utc(y);
		const expectedEnd = jan1Utc(y + 1);
		const clampedStart = expectedStart < minDate ? minDate : expectedStart;
		const clampedEndDay = (expectedEnd > maxDate ? dateToDay(maxDate) : dateToDay(expectedEnd) - 1);
		return dateToDay(startDate) === dateToDay(clampedStart) && endDay === clampedEndDay;
	}

	function snapDay(day: number): number {
		if (!sliderContainer || totalDays <= 0) return day;
		const pxPerDay = sliderContainer.clientWidth / totalDays;
		const snapDays = Math.ceil(SNAP_PX / pxPerDay);
		const startYear = minDate.getUTCFullYear() + 1;
		const endYear = maxDate.getUTCFullYear();
		for (let y = startYear; y <= endYear; y++) {
			const tick = dateToDay(jan1Utc(y));
			if (Math.abs(day - tick) <= snapDays) return tick;
		}
		return day;
	}

	function handleStartSlider(e: Event) {
		const input = e.target as HTMLInputElement;
		const clamped = Math.min(snapDay(Number(input.value)), endDay);
		input.value = String(clamped);
		onchange(dayToDate(clamped), endDate);
	}

	function handleEndSlider(e: Event) {
		const input = e.target as HTMLInputElement;
		const clamped = Math.max(snapDay(Number(input.value)), startDay);
		input.value = String(clamped);
		onchange(startDate, dayToDate(clamped));
	}

	function handleStartInput(e: Event) {
		const d = new Date((e.target as HTMLInputElement).value + 'T00:00:00');
		if (!isNaN(d.getTime())) {
			const clamped = new Date(Math.max(d.getTime(), minDate.getTime()));
			onchange(clamped > endDate ? endDate : clamped, endDate);
		}
	}

	function handleEndInput(e: Event) {
		const d = new Date((e.target as HTMLInputElement).value + 'T00:00:00');
		if (!isNaN(d.getTime())) {
			const clamped = new Date(Math.min(d.getTime(), maxDate.getTime()));
			onchange(startDate, clamped < startDate ? startDate : clamped);
		}
	}

	const isFiltered = $derived(
		dateToDay(startDate) > 0 || dateToDay(endDate) < totalDays
	);

	function reset() {
		onchange(minDate, maxDate);
	}

	const quickPicks = [
		{ label: '1M', months: 1 },
		{ label: '3M', months: 3 },
		{ label: '6M', months: 6 },
		{ label: '1Y', months: 12 },
		{ label: 'YTD', months: -1 },
		{ label: 'ALL', months: 0 }
	] as const;

	let defaultApplied = false;
	$effect(() => {
		if (defaultPick && !defaultApplied && totalDays > 0) {
			defaultApplied = true;
			const pick = quickPicks.find((q) => q.label === defaultPick);
			if (pick) pickRange(pick.months);
		}
	});

	function pickRange(months: number) {
		if (months === 0) return reset();
		if (months === -1) {
			const ytdStart = jan1Utc(maxDate.getUTCFullYear());
			const clamped = ytdStart < minDate ? minDate : ytdStart;
			return onchange(clamped, maxDate);
		}
		const start = new Date(maxDate);
		start.setMonth(start.getMonth() - months);
		const clamped = start < minDate ? minDate : start;
		onchange(clamped, maxDate);
	}

	function isActivePick(months: number): boolean {
		if (months === 0) return !isFiltered;
		if (months === -1) {
			const ytdStart = jan1Utc(maxDate.getUTCFullYear());
			const clamped = ytdStart < minDate ? minDate : ytdStart;
			return (
				Math.abs(startDate.getTime() - clamped.getTime()) < msPerDay &&
				dateToDay(endDate) >= totalDays
			);
		}
		const expected = new Date(maxDate);
		expected.setMonth(expected.getMonth() - months);
		const clamped = expected < minDate ? minDate : expected;
		return (
			Math.abs(startDate.getTime() - clamped.getTime()) < msPerDay &&
			dateToDay(endDate) >= totalDays
		);
	}

	const yearTicks = $derived.by(() => {
		if (totalDays <= 0) return [];
		const ticks: { pct: number; year: number; showLabel: boolean }[] = [];
		const startYear = minDate.getUTCFullYear() + 1;
		const endYear = maxDate.getUTCFullYear();
		for (let y = startYear; y <= endYear; y++) {
			const day = dateToDay(jan1Utc(y));
			if (day > 0 && day < totalDays) {
				const pct = (day / totalDays) * 100;
				ticks.push({ pct, year: y, showLabel: pct > 8 && pct < 92 });
			}
		}
		return ticks;
	});

	type YearSegment = { year: number; leftPct: number; widthPct: number };
	const yearSegments = $derived.by((): YearSegment[] => {
		if (totalDays <= 0) return [];
		const edges = [0, ...yearTicks.map((t) => t.pct), 100];
		const firstYear = minDate.getUTCFullYear();
		const segments: YearSegment[] = [];
		for (let i = 0; i < edges.length - 1; i++) {
			segments.push({ year: firstYear + i, leftPct: edges[i], widthPct: edges[i + 1] - edges[i] });
		}
		return segments;
	});

	let sliderContainer: HTMLDivElement | undefined = $state();
	let dragging = $state(false);
	let dragOriginX = 0;
	let dragStartDay = 0;
	let dragEndDay = 0;

	function startDrag(e: PointerEvent) {
		e.preventDefault();
		dragging = true;
		dragOriginX = e.clientX;
		dragStartDay = startDay;
		dragEndDay = endDay;
		window.addEventListener('pointermove', moveDrag);
		window.addEventListener('pointerup', endDrag);
	}

	function moveDrag(e: PointerEvent) {
		if (!dragging || !sliderContainer) return;
		const pxPerDay = sliderContainer.clientWidth / totalDays;
		const deltaDays = Math.round((e.clientX - dragOriginX) / pxPerDay);
		const span = dragEndDay - dragStartDay;
		let newStart = dragStartDay + deltaDays;
		let newEnd = dragEndDay + deltaDays;
		if (newStart < 0) { newStart = 0; newEnd = span; }
		if (newEnd > totalDays) { newEnd = totalDays; newStart = totalDays - span; }
		const snappedStart = snapDay(newStart);
		if (snappedStart !== newStart) {
			newStart = snappedStart;
			newEnd = snappedStart + span;
			if (newEnd > totalDays) { newEnd = totalDays; newStart = totalDays - span; }
		}
		onchange(dayToDate(newStart), dayToDate(newEnd));
	}

	function endDrag() {
		dragging = false;
		window.removeEventListener('pointermove', moveDrag);
		window.removeEventListener('pointerup', endDrag);
	}
</script>

{#if minimal}
<div class="flex flex-wrap items-center gap-1">
	{#each quickPicks as qp (qp.label)}
		<button
			onclick={() => pickRange(qp.months)}
			class="rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors {isActivePick(qp.months) ? 'bg-brand text-surface' : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'}"
		>
			{qp.label}
		</button>
	{/each}
	{#if isFiltered}
		<span class="ml-1 text-[10px] text-text-secondary">
			{dateFmt.format(startDate)} – {dateFmt.format(endDate)}
		</span>
	{/if}
</div>
{:else}
<div class="overflow-x-auto rounded-xl border border-border bg-surface-raised px-5 py-4">
	<div class="min-w-fit">
	<div class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-3">
			<input
				type="date"
				value={toIso(startDate)}
				min={toIso(minDate)}
				max={toIso(endDate)}
				oninput={handleStartInput}
				class="rounded-lg border border-border bg-surface-overlay px-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand"
			/>
			<span class="text-xs text-text-secondary">to</span>
			<input
				type="date"
				value={toIso(endDate)}
				min={toIso(startDate)}
				max={toIso(maxDate)}
				oninput={handleEndInput}
				class="rounded-lg border border-border bg-surface-overlay px-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand"
			/>
			<div class="flex gap-1">
				{#each quickPicks as qp (qp.label)}
					<button
						onclick={() => pickRange(qp.months)}
						class="rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors {isActivePick(qp.months) ? 'bg-brand text-surface' : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary'}"
					>
						{qp.label}
					</button>
				{/each}
			</div>
		</div>
		<div class="flex items-center gap-2">
			{#if isFiltered}
				<button
					onclick={reset}
					class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
				>
					Reset
				</button>
			{/if}
			<a
				href={accountStatementUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
			>
				Account statement ↗
			</a>
		</div>
	</div>

	{#if totalDays > 0}
		<div bind:this={sliderContainer} class="relative mt-3 h-6">
			<div class="absolute inset-0 mx-2">
				<div class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-overlay"></div>
				{#each yearSegments as seg (seg.year)}
					<button
						onclick={() => pickYear(seg.year)}
						class="absolute top-0 z-5 h-full transition-colors hover:bg-text-secondary/5 {isActiveYear(seg.year) ? 'bg-brand/8' : ''}"
						style="left: {seg.leftPct}%; width: {seg.widthPct}%"
						aria-label="Filter to {seg.year}"
					></button>
				{/each}
				{#each yearTicks as tick (tick.year)}
					<div class="pointer-events-none absolute top-1/2 z-6 h-3 w-px -translate-y-1/2 bg-text-secondary/30" style="left: {tick.pct}%"></div>
				{/each}
				<div
					role="slider"
					tabindex="-1"
					aria-valuenow={startDay}
					aria-valuemin={0}
					aria-valuemax={totalDays}
					onpointerdown={startDrag}
					class="absolute top-1/2 z-10 h-5 -translate-y-1/2 {dragging ? 'cursor-grabbing' : 'cursor-grab'}"
					style="left: {trackLeft}%; right: {trackRight}%"
				>
					<div class="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand/60"></div>
				</div>
			</div>
			<input
				type="range"
				min="0"
				max={totalDays}
				value={startDay}
				oninput={handleStartSlider}
				class="range-thumb absolute inset-x-0 top-0 z-20 h-6 w-full appearance-none bg-transparent"
			/>
			<input
				type="range"
				min="0"
				max={totalDays}
				value={endDay}
				oninput={handleEndSlider}
				class="range-thumb absolute inset-x-0 top-0 z-20 h-6 w-full appearance-none bg-transparent"
			/>
		</div>
		<div class="relative mt-1 mx-2 h-4">
			<span class="absolute left-0 text-[10px] text-text-secondary">{dateFmt.format(minDate)}</span>
			{#each yearTicks as tick (tick.year)}
				{#if tick.showLabel}
					<span class="absolute -translate-x-1/2 text-[10px] {isActiveYear(tick.year) ? 'font-medium text-brand' : 'text-text-secondary/50'}" style="left: {tick.pct}%">{tick.year}</span>
				{/if}
			{/each}
			<span class="absolute right-0 text-[10px] text-text-secondary">{dateFmt.format(maxDate)}</span>
		</div>
	{/if}
	</div>
</div>
{/if}

<style>
	.range-thumb {
		pointer-events: none;
	}
	.range-thumb::-webkit-slider-thumb {
		pointer-events: all;
		-webkit-appearance: none;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 9999px;
		background: var(--color-brand);
		cursor: pointer;
		border: 2px solid var(--color-surface);
		box-shadow: 0 0 0 1px var(--color-brand-dark);
	}
	.range-thumb::-moz-range-thumb {
		pointer-events: all;
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 9999px;
		background: var(--color-brand);
		cursor: pointer;
		border: 2px solid var(--color-surface);
		box-shadow: 0 0 0 1px var(--color-brand-dark);
	}
	:global(input[type='date']::-webkit-calendar-picker-indicator) {
		filter: invert(0.7);
	}
</style>
