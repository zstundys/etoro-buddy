<script lang="ts">
  import "../app.css";
  import { dev } from "$app/environment";
  import favicon from "$lib/assets/favicon.jpg";
  import { onMount } from "svelte";
  import { initPrivacy, togglePrivacy } from "$lib/privacy-mode";

  let { children } = $props();

  let privacyOn = $state(false);

  onMount(() => {
    privacyOn = initPrivacy();
  });

  function handleToggle() {
    privacyOn = togglePrivacy();
  }
</script>

<svelte:head>
  <link rel="icon" type="image/jpeg" href={favicon} />
  <title>{dev ? "[dev] " : ""}eToro Buddy</title>
</svelte:head>

<div class="min-h-screen bg-surface text-text-primary">
  <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header class="mb-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
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
            <h1 class="text-2xl font-semibold tracking-tight">Portfolio</h1>
            <p class="text-sm text-text-secondary">eToro open positions</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
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
