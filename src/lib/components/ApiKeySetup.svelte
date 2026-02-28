<script lang="ts">
  let {
    onsubmit,
    onclear,
    onrefresh,
    hasKeys = false,
    error = null,
    loading = false,
    refreshing = false,
    lastLoaded = null,
    fromCache = false,
    compact = false,
  }: {
    onsubmit: (apiKey: string, userKey: string) => void;
    onclear?: () => void;
    onrefresh?: () => void;
    hasKeys?: boolean;
    error?: string | null;
    loading?: boolean;
    refreshing?: boolean;
    lastLoaded?: Date | null;
    fromCache?: boolean;
    compact?: boolean;
  } = $props();

  function formatLastLoaded(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  let apiKey = $state("");
  let userKey = $state("");
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
    apiKey = "";
    userKey = "";
    formOverride = null;
    onclear?.();
  }
</script>

{#if hasKeys && !showForm}
  <div
    class="flex items-baseline gap-2 {compact
      ? ''
      : 'rounded-xl border border-border bg-surface-raised px-5 py-4'}"
  >
    <div class="flex h-6 w-6 items-center justify-center rounded-md bg-gain/15">
      <svg
        class="h-3.5 w-3.5 text-gain"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M20 6L9 17l-5-5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <span class="text-sm text-text-secondary">Using your API keys</span>
    {#if lastLoaded}
      <span class="text-xs text-text-secondary/60">
        {fromCache ? "Cached" : "Updated"}
        {formatLastLoaded(lastLoaded)}</span
      >
    {/if}
    <div class="ml-auto flex items-center gap-2">
      <button
        onclick={onrefresh}
        disabled={refreshing}
        class="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
      >
        <svg
          class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 2v6h-6" stroke-linecap="round" stroke-linejoin="round" />
          <path
            d="M3 12a9 9 0 0115.36-6.36L21 8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M3 22v-6h6" stroke-linecap="round" stroke-linejoin="round" />
          <path
            d="M21 12a9 9 0 01-15.36 6.36L3 16"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {refreshing ? "Refreshing..." : "Refresh"}
      </button>
      <button
        onclick={() => {
          formOverride = true;
        }}
        class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
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
  </div>
{:else}
  <div
    class={compact
      ? ""
      : "rounded-xl border border-border bg-surface-raised p-6"}
  >
    {#if !compact}
      <div class="mb-4 flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15"
        >
          <svg
            class="h-5 w-5 text-brand"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
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
              >Settings &gt; Trading &gt; API Key Management</a
            >. Keys are stored locally in your browser only.
          </p>
        </div>
      </div>
    {/if}

    {#if !compact}
      <div
        class="mb-4 flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2.5"
      >
        <svg
          class="mt-0.5 h-4 w-4 shrink-0 text-brand"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path
            d="M12 16v-4m0-4h.01"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <p class="text-xs leading-relaxed text-text-secondary">
          <strong class="text-text-primary">Your data stays with you.</strong>
          All API calls are made directly from your browser to the
          <a
            href="https://api-portal.etoro.com/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-brand hover:underline">eToro API</a
          > — no intermediary server collects or stores your data. API keys are saved
          in your browser's localStorage and never transmitted anywhere else. This
          app is a fully static site with no backend, analytics, or tracking.
        </p>
      </div>
    {/if}

    <form onsubmit={handleSubmit} class="space-y-3">
      <div>
        <label
          for="api-key"
          class="mb-1 block text-xs font-medium text-text-secondary"
          >API Key (Public Key)</label
        >
        <input
          id="api-key"
          type={revealed ? "text" : "password"}
          bind:value={apiKey}
          placeholder="Your eToro API key"
          required
          autocomplete="off"
          class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-brand"
        />
      </div>
      <div>
        <label
          for="user-key"
          class="mb-1 block text-xs font-medium text-text-secondary"
          >User Key (Generated Key)</label
        >
        <input
          id="user-key"
          type={revealed ? "text" : "password"}
          bind:value={userKey}
          placeholder="Your eToro user key"
          required
          autocomplete="off"
          class="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/50 focus:border-brand"
        />
      </div>

      <div class="flex items-center gap-3">
        <label
          class="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary"
        >
          <input type="checkbox" bind:checked={revealed} class="accent-brand" />
          Show keys
        </label>
      </div>

      {#if error}
        <div
          class="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss"
        >
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
            onclick={() => {
              formOverride = false;
            }}
            class="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancel
          </button>
        {/if}
      </div>
    </form>
  </div>
{/if}
