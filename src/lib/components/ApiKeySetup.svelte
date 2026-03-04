<script lang="ts">
  import { onMount } from "svelte";
  import { initPrivacy, togglePrivacy } from "$lib/privacy-mode";
  import { exportLocalStorage, importLocalStorage } from "$lib/data-transfer";

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

  let privacyOn = $state(false);

  onMount(() => {
    privacyOn = initPrivacy();
  });

  function handlePrivacyToggle() {
    privacyOn = togglePrivacy();
  }

  let dialogEl: HTMLDialogElement | undefined = $state();
  let transferMode = $state<"export" | "import">("export");
  let textValue = $state("");
  let statusMsg = $state("");

  function openDialog(m: "export" | "import") {
    transferMode = m;
    statusMsg = "";
    textValue = m === "export" ? exportLocalStorage() : "";
    dialogEl?.showModal();
  }

  function closeDialog() {
    dialogEl?.close();
    statusMsg = "";
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(textValue);
      statusMsg = "Copied to clipboard";
    } catch {
      statusMsg = "Copy failed — select all and copy manually";
    }
  }

  function handleImport() {
    try {
      const { imported } = importLocalStorage(textValue);
      statusMsg = `Imported ${imported} key${imported === 1 ? "" : "s"}. Reload to apply.`;
    } catch (e) {
      statusMsg = `Error: ${e instanceof Error ? e.message : "Invalid data"}`;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) closeDialog();
  }

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
    class="flex min-w-0 flex-wrap items-baseline gap-2 gap-y-2 {compact
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
    <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
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
      <span class="mx-0.5 h-4 w-px bg-border"></span>
      <button
        onclick={() => openDialog("export")}
        class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        title="Export / Import data"
      >
        <svg
          class="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>
      <button
        onclick={handlePrivacyToggle}
        class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        title={privacyOn ? "Show values" : "Hide values"}
      >
        {#if privacyOn}
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"
            />
            <path
              d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"
            />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        {:else}
          <svg
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        {/if}
      </button>
    </div>
  </div>
{:else}
  <div
    class="min-w-0 {compact
      ? ''
      : 'rounded-xl border border-border bg-surface-raised p-6'}"
  >
    {#if !compact}
      <div class="mb-4 flex min-w-0 flex-wrap items-start gap-3">
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
        <div class="min-w-0 flex-1">
          <h3 class="text-sm font-semibold">Connect your eToro account</h3>
          <p class="mt-1 wrap-break-word text-xs text-text-secondary">
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
        class="mb-4 flex min-w-0 items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2.5"
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
        <p
          class="min-w-0 flex-1 wrap-break-word text-xs leading-relaxed text-text-secondary"
        >
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

      <div class="flex flex-wrap items-center gap-2 pt-1">
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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={dialogEl}
  class="m-auto w-full max-w-lg rounded-xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/60"
  onclick={handleBackdropClick}
>
  <div class="flex flex-col gap-4 p-5">
    <div class="flex items-center justify-between">
      <div
        class="inline-flex rounded-lg border border-border bg-surface-raised p-0.5 text-xs"
      >
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {transferMode ===
          'export'
            ? 'bg-surface-overlay text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => {
            transferMode = "export";
            textValue = exportLocalStorage();
            statusMsg = "";
          }}
        >
          Export
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {transferMode ===
          'import'
            ? 'bg-surface-overlay text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => {
            transferMode = "import";
            textValue = "";
            statusMsg = "";
          }}
        >
          Import
        </button>
      </div>
      <button
        type="button"
        onclick={closeDialog}
        class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        title="Close"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    {#if transferMode === "export"}
      <p class="text-xs text-text-secondary">
        Copy this data and paste it into Import on another browser or device.
        API keys are never included.
      </p>
      <textarea
        readonly
        class="h-64 w-full resize-y rounded-lg border border-border bg-surface-overlay p-3 font-mono text-xs text-text-primary outline-none focus:border-brand"
        value={textValue}
        onclick={(e) => {
          const el = e.currentTarget;
          if (el instanceof HTMLTextAreaElement) el.select();
        }}
      ></textarea>
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={copyToClipboard}
          class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90"
        >
          Copy to clipboard
        </button>
        {#if statusMsg}
          <span class="text-xs text-text-secondary">{statusMsg}</span>
        {/if}
      </div>
    {:else}
      <p class="text-xs text-text-secondary">
        Paste previously exported data below and click Import. Existing keys
        will be overwritten. API keys are never imported.
      </p>
      <textarea
        class="h-64 w-full resize-y rounded-lg border border-border bg-surface-overlay p-3 font-mono text-xs text-text-primary outline-none placeholder:text-text-secondary/50 focus:border-brand"
        placeholder="Paste exported JSON here..."
        bind:value={textValue}
      ></textarea>
      <div class="flex items-center gap-3">
        <button
          type="button"
          onclick={handleImport}
          disabled={!textValue.trim()}
          class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Import
        </button>
        {#if statusMsg}
          <span
            class="text-xs {statusMsg.startsWith('Error')
              ? 'text-loss'
              : 'text-text-secondary'}"
          >
            {statusMsg}
          </span>
        {/if}
      </div>
    {/if}
  </div>
</dialog>
