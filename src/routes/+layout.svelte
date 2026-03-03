<script lang="ts">
  import "../app.css";
  import { dev } from "$app/environment";
  import { base } from "$app/paths";
  import { onMount } from "svelte";
  import { initPrivacy, togglePrivacy } from "$lib/privacy-mode";
  import { exportLocalStorage, importLocalStorage } from "$lib/data-transfer";

  let { children } = $props();

  let privacyOn = $state(false);

  onMount(() => {
    privacyOn = initPrivacy();
  });

  function handleToggle() {
    privacyOn = togglePrivacy();
  }

  let dialogEl: HTMLDialogElement | undefined = $state();
  let mode = $state<"export" | "import">("export");
  let textValue = $state("");
  let statusMsg = $state("");

  function openDialog(m: "export" | "import") {
    mode = m;
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
</script>

<svelte:head>
  <link rel="icon" type="image/svg+xml" href={`${base}/favicon-bull.svg`} />
  <link rel="manifest" href={`${base}/site.webmanifest`} />
  <meta name="theme-color" content="#0f1117" />
  <title>{dev ? "[dev] " : ""}eToro Buddy</title>
</svelte:head>

<div class="min-h-screen bg-surface text-text-primary">
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3 leading-none">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15"
          >
            <svg
              class="h-5 w-5 text-brand"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M3 3v18h18"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M7 16l4-8 4 4 5-9"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 class="text-2xl -mb-1 font-semibold tracking-tight">
              Portfolio
            </h1>
            <a
              href="https://www.etoro.com/home"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Open eToro
            </a>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            onclick={() => openDialog("export")}
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            title="Export / Import data"
          >
            <svg
              class="h-5 w-5"
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
            onclick={handleToggle}
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label={privacyOn ? "Show values" : "Hide values"}
            title={privacyOn ? "Show values" : "Hide values"}
          >
            {#if privacyOn}
              <svg
                class="h-5 w-5"
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
                class="h-5 w-5"
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
          <a
            href="https://github.com/zstundys/etoro-buddy"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label="View on GitHub"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
              />
            </svg>
          </a>
        </div>
      </div>
    </header>

    {@render children()}
  </div>
</div>

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
          class="rounded-md px-3 py-1 font-medium transition-colors {mode ===
          'export'
            ? 'bg-surface-overlay text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => {
            mode = "export";
            textValue = exportLocalStorage();
            statusMsg = "";
          }}
        >
          Export
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-1 font-medium transition-colors {mode ===
          'import'
            ? 'bg-surface-overlay text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary'}"
          onclick={() => {
            mode = "import";
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

    {#if mode === "export"}
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
        placeholder='Paste exported JSON here...'
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
