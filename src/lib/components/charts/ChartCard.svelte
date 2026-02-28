<script lang="ts">
	import type { Snippet } from 'svelte';

	let { storageKey, title, description, expanded = true, header, children }: {
		storageKey: string;
		title?: string;
		description?: string;
		expanded?: boolean;
		header?: Snippet<[{ open: boolean; toggle: () => void }]>;
		children: Snippet;
	} = $props();

	function loadOpen(): boolean {
		try {
			const raw = localStorage.getItem(storageKey);
			if (raw !== null) return raw === '1';
		} catch { /* ignore */ }
		return expanded;
	}

	let open = $state(loadOpen());
	let showInfo = $state(false);

	function toggle() {
		open = !open;
		try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch { /* ignore */ }
	}
</script>

<div class="rounded-xl border border-border bg-surface-raised">
	{#if header}
		{@render header({ open, toggle })}
	{:else}
		<div class="flex items-center">
			<button
				type="button"
				class="flex flex-1 items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-surface-overlay/40"
				onclick={toggle}
			>
				<svg
					class="h-3.5 w-3.5 shrink-0 text-text-secondary transition-transform duration-200"
					class:rotate-90={open}
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
				<h3 class="text-xs font-medium uppercase tracking-wider text-text-secondary">{title}</h3>
			</button>
			{#if description}
				<button
					type="button"
					class="mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-text-secondary/50 transition-colors hover:bg-surface-overlay hover:text-text-primary"
					class:bg-surface-overlay={showInfo}
					class:text-text-primary={showInfo}
					onclick={() => (showInfo = !showInfo)}
					title="About this chart"
				>
					<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="16" x2="12" y2="12" />
						<line x1="12" y1="8" x2="12.01" y2="8" />
					</svg>
				</button>
			{/if}
		</div>
	{/if}
	{#if showInfo && description}
		<div class="mx-5 mb-3 rounded-lg bg-surface-overlay/50 px-4 py-3 text-xs leading-relaxed text-text-secondary">
			{description}
		</div>
	{/if}
	{#if open}
		<div class="px-5 pb-5">
			{@render children()}
		</div>
	{/if}
</div>
