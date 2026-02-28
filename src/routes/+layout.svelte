<script lang="ts">
	import '../app.css';
	import { dev } from '$app/environment';
	import favicon from '$lib/assets/favicon.jpg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/jpeg" href={favicon} />
	<title>{dev ? '[dev] ' : ''}eToro Buddy</title>
</svelte:head>

<div class="min-h-screen bg-surface text-text-primary">
	<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
		<header class="mb-8">
			<div class="flex items-center gap-3">
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15">
					<svg class="h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 3v18h18" stroke-linecap="round" stroke-linejoin="round" />
						<path d="M7 16l4-8 4 4 5-9" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Portfolio</h1>
					<p class="text-sm text-text-secondary">eToro open positions</p>
				</div>
			</div>
		</header>

		{@render children()}
	</div>
</div>
