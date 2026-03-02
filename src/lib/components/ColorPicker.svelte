<script lang="ts">
  import { PALETTE } from "$lib/chart-utils";

  let {
    value,
    onchange,
  }: {
    value: string;
    onchange: (color: string) => void;
  } = $props();

  let open = $state(false);
  let anchorEl: HTMLButtonElement | undefined = $state();
  let panelEl: HTMLDivElement | undefined = $state();
  let pos = $state({ top: 0, left: 0 });

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (open) {
      open = false;
      return;
    }
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      pos = { top: rect.bottom + 4, left: rect.left };
    }
    open = true;
  }

  function pick(c: string) {
    onchange(c);
    open = false;
  }

  function handleWindowClick(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (anchorEl?.contains(target) || panelEl?.contains(target)) return;
    open = false;
  }
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={(e) => {
    if (open && e.key === "Escape") {
      open = false;
    }
  }}
/>

<button
  bind:this={anchorEl}
  type="button"
  class="h-5 w-5 shrink-0 rounded-sm border border-border transition-shadow hover:ring-2 hover:ring-brand/40"
  style="background:{value}"
  onclick={toggle}
  title="Pick color"
></button>

{#if open}
  <div
    bind:this={panelEl}
    class="fixed z-50 m-0 grid grid-cols-8 gap-1.5 rounded-lg border border-border bg-surface-raised p-2.5 shadow-xl"
    style="top:{pos.top}px; left:{pos.left}px"
  >
    {#each PALETTE as c (c)}
      <button
        type="button"
        title={c}
        class="h-6 w-6 rounded-sm transition-transform hover:scale-125 {value === c ? 'ring-2 ring-text-primary ring-offset-1 ring-offset-surface-raised' : ''}"
        style="background:{c}"
        onclick={() => pick(c)}
      ></button>
    {/each}
  </div>
{/if}
