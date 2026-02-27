<script lang="ts">
	let {
		onsubmit,
		onclear,
		hasKeys = false,
		error = null,
		loading = false,
		compact = false
	}: {
		onsubmit: (apiKey: string, userKey: string) => void;
		onclear?: () => void;
		hasKeys?: boolean;
		error?: string | null;
		loading?: boolean;
		compact?: boolean;
	} = $props();

	let apiKey = $state('');
	let userKey = $state('');
	let formOverride = $state<boolean | null>(null);
	const showForm = $derived(formOverride ?? !hasKeys);
	let revealed = $state(false);

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!apiKey.trim() || !userKey.trim()) return;
		onsubmit(apiKey, userKey);
		formOverride = false;
		revealed = false;
	}

	function handleClear() {
		apiKey = '';
		userKey = '';
		formOverride = null;
		onclear?.();
	}
</script>

{#if hasKeys && !showForm}
	<div class="flex items-center gap-2 {compact ? '' : 'rounded-xl border border-border bg-surface-raised px-5 py-4'}">
		<div class="flex h-6 w-6 items-center justify-center rounded-md bg-gain/15">
			<svg class="h-3.5 w-3.5 text-gain" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</div>
		<span class="text-sm text-text-secondary">Using your API keys</span>
		<button
			onclick={() => { formOverride = true; }}
			class="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
		>
			Change
		</button>
		<button
			onclick={handleClear}
			class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-loss"
		>
			Remove
		</button>
	</div>
{:else}
	<div class="{compact ? '' : 'rounded-xl border border-border bg-surface-raised p-6'}">
		{#if !compact}
			<div class="mb-4 flex items-start gap-3">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15">
					<svg class="h-5 w-5 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<div>
					<h3 class="text-sm font-semibold">Connect your eToro account</h3>
					<p class="mt-1 text-xs text-text-secondary">
						Enter your API keys from eToro:
						<a
							href="https://www.etoro.com/settings/api"
							target="_blank"
							rel="noopener noreferrer"
							class="text-brand hover:underline"
						>Settings &gt; Trading &gt; API Key Management</a>.
						Keys are stored locally in your browser only.
					</p>
				</div>
			</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-3">
			<div>
				<label for="api-key" class="mb-1 block text-xs font-medium text-text-secondary">API Key</label>
				<input
					id="api-key"
					type={revealed ? 'text' : 'password'}
					bind:value={apiKey}
					placeholder="Your eToro API key"
					required
					autocomplete="off"
					class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-brand"
				/>
			</div>
			<div>
				<label for="user-key" class="mb-1 block text-xs font-medium text-text-secondary">User Key</label>
				<input
					id="user-key"
					type={revealed ? 'text' : 'password'}
					bind:value={userKey}
					placeholder="Your eToro user key"
					required
					autocomplete="off"
					class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-brand"
				/>
			</div>

			<div class="flex items-center gap-3">
				<label class="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
					<input type="checkbox" bind:checked={revealed} class="accent-brand" />
					Show keys
				</label>
			</div>

			{#if error}
				<div class="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">
					{error}
				</div>
			{/if}

			<div class="flex items-center gap-2 pt-1">
				<button
					type="submit"
					disabled={loading || !apiKey.trim() || !userKey.trim()}
					class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{#if loading}
						Loading...
					{:else}
						Connect
					{/if}
				</button>
				{#if hasKeys}
					<button
						type="button"
						onclick={() => { formOverride = false; }}
						class="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
					>
						Cancel
					</button>
				{/if}
			</div>
		</form>
	</div>
{/if}
