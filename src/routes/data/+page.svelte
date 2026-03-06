<script lang="ts">
  import { getAppContext } from "$lib/app-context";
  import type { ManualHolding } from "$lib/manual-holdings.svelte";
  import Money from "$lib/components/Money.svelte";
  import { shortDate as dateFmt, normalizeSymbol, currency } from "$lib/format";

  const { client, manualStore, merged } = getAppContext();

  const etoroPositions = $derived(client.portfolio?.positions ?? []);

  let editingId = $state<string | null>(null);
  let editForm = $state({
    symbol: "",
    buyDate: "",
    buyPrice: "",
    units: "",
    source: "",
  });

  let addForm = $state({
    symbol: "",
    buyDate: "",
    buyPrice: "",
    units: "",
    source: "",
  });
  let showAddForm = $state(false);

  function resetAddForm() {
    addForm = { symbol: "", buyDate: "", buyPrice: "", units: "", source: "" };
  }

  function handleAdd() {
    const symbol = addForm.symbol.trim().toUpperCase();
    const buyDate = addForm.buyDate;
    const buyPrice = parseFloat(addForm.buyPrice);
    const units = parseFloat(addForm.units);
    const source = addForm.source.trim() || undefined;

    if (
      !symbol ||
      !buyDate ||
      isNaN(buyPrice) ||
      isNaN(units) ||
      buyPrice < 0 ||
      units <= 0
    )
      return;

    manualStore.add({ symbol, buyDate, buyPrice, units, source });
    resetAddForm();
    showAddForm = false;
  }

  function startEdit(h: ManualHolding) {
    editingId = h.id;
    editForm = {
      symbol: h.symbol,
      buyDate: h.buyDate,
      buyPrice: String(h.buyPrice),
      units: String(h.units),
      source: h.source ?? "",
    };
  }

  function cancelEdit() {
    editingId = null;
  }

  function saveEdit() {
    if (!editingId) return;
    const symbol = editForm.symbol.trim().toUpperCase();
    const buyDate = editForm.buyDate;
    const buyPrice = parseFloat(editForm.buyPrice);
    const units = parseFloat(editForm.units);
    const source = editForm.source.trim() || undefined;

    if (
      !symbol ||
      !buyDate ||
      isNaN(buyPrice) ||
      isNaN(units) ||
      buyPrice < 0 ||
      units <= 0
    )
      return;

    const existing = manualStore.holdings.find((h) => h.id === editingId);
    const symbolChanged = existing && existing.symbol.toUpperCase() !== symbol;

    manualStore.update(editingId, {
      symbol,
      buyDate,
      buyPrice,
      units,
      source,
      ...(symbolChanged ? { instrumentId: undefined } : {}),
    });
    editingId = null;
  }

  function handleDelete(id: string) {
    manualStore.remove(id);
    if (editingId === id) editingId = null;
  }

  const manualTotalInvested = $derived(
    manualStore.holdings.reduce((s, h) => s + h.buyPrice * h.units, 0),
  );

  const etoroTotalInvested = $derived(client.portfolio?.totalInvested ?? 0);
</script>

<div class="grid gap-y-8">
  <section>
    <div
      class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"
    >
      <h2 class="text-lg font-semibold">eToro Positions</h2>
      {#if etoroPositions.length > 0}
        <span class="text-sm text-text-secondary">
          {etoroPositions.length} position{etoroPositions.length !== 1
            ? "s"
            : ""}
          &middot; <Money value={etoroTotalInvested} /> invested
        </span>
      {/if}
    </div>

    {#if !client.hasKeys}
      <div
        class="rounded-xl border border-border bg-surface-raised px-6 py-10 text-center sm:px-8 sm:py-12"
      >
        <p class="text-sm text-text-secondary">
          No eToro API keys configured. Add them above to see your eToro
          positions here.
        </p>
      </div>
    {:else if client.loading}
      <div
        class="flex items-center justify-center gap-3 rounded-xl border border-border bg-surface-raised px-6 py-10 sm:px-8 sm:py-12"
      >
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
        ></div>
        <p class="text-sm text-text-secondary">Loading...</p>
      </div>
    {:else if etoroPositions.length === 0}
      <div
        class="rounded-xl border border-border bg-surface-raised px-6 py-10 text-center sm:px-8 sm:py-12"
      >
        <p class="text-sm text-text-secondary">No open positions on eToro</p>
      </div>
    {:else}
      <!-- Mobile: card layout -->
      <div class="flex flex-col gap-2 sm:hidden">
        {#each etoroPositions as pos, i (pos.positionId || i)}
          <div
            class="rounded-xl border border-border bg-surface-raised px-4 py-3"
          >
            <div class="mb-2 flex items-baseline justify-between">
              <span class="text-sm font-medium"
                >{normalizeSymbol(pos.symbol ?? `#${pos.instrumentId}`)}</span
              >
              <span class="text-xs text-text-secondary"
                >{dateFmt.format(new Date(pos.openDateTime))}</span
              >
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div class="text-text-secondary">Buy Price</div>
              <div class="text-right tabular-nums">
                <Money value={pos.openRate} public />
              </div>
              <div class="text-text-secondary">Units</div>
              <div class="text-right tabular-nums">
                <span data-private>{pos.units.toFixed(4)}</span>
              </div>
              <div class="text-text-secondary">Invested</div>
              <div class="text-right tabular-nums font-medium">
                <Money value={pos.amount} />
              </div>
              <div class="text-text-secondary">Current</div>
              <div class="text-right tabular-nums">
                {#if pos.currentRate !== undefined}
                  <Money value={pos.currentRate} public />
                {:else}
                  <span class="text-text-secondary">--</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Desktop: table layout -->
      <div
        class="hidden sm:block rounded-xl border border-border bg-surface-raised"
      >
        <div class="max-h-80 overflow-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-surface-raised">
              <tr
                class="border-b border-border/50 text-[10px] font-medium uppercase tracking-wider text-text-secondary"
              >
                <th class="rounded-tl-xl py-2.5 pl-4 pr-3 text-left">Symbol</th>
                <th class="px-3 py-2.5 text-left">Date</th>
                <th class="px-3 py-2.5 text-right">Buy Price</th>
                <th class="px-3 py-2.5 text-right">Units</th>
                <th class="px-3 py-2.5 text-right">Invested</th>
                <th class="rounded-tr-xl py-2.5 pl-3 pr-4 text-right"
                  >Current</th
                >
              </tr>
            </thead>
            <tbody>
              {#each etoroPositions as pos, i (pos.positionId || i)}
                <tr
                  class="border-b border-border/20 last:border-b-0 transition-colors hover:bg-surface-overlay/20"
                >
                  <td class="py-2 pl-4 pr-3 font-medium">
                    {normalizeSymbol(pos.symbol ?? `#${pos.instrumentId}`)}
                  </td>
                  <td class="px-3 py-2 text-text-secondary">
                    {dateFmt.format(new Date(pos.openDateTime))}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    <Money value={pos.openRate} public />
                  </td>
                  <td
                    class="px-3 py-2 text-right tabular-nums text-text-secondary"
                  >
                    <span data-private>{pos.units.toFixed(4)}</span>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums font-medium">
                    <Money value={pos.amount} />
                  </td>
                  <td class="py-2 pl-3 pr-4 text-right tabular-nums">
                    {#if pos.currentRate !== undefined}
                      <Money value={pos.currentRate} public />
                    {:else}
                      <span class="text-text-secondary">--</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </section>

  <section>
    <div
      class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between"
    >
      <h2 class="text-lg font-semibold">Manual Holdings</h2>
      <div class="flex items-center gap-3">
        {#if manualStore.holdings.length > 0}
          <span class="text-sm text-text-secondary">
            {manualStore.holdings.length} holding{manualStore.holdings
              .length !== 1
              ? "s"
              : ""}
            &middot; <Money value={manualTotalInvested} /> invested
          </span>
        {/if}
        {#if !showAddForm}
          <button
            onclick={() => {
              showAddForm = true;
              resetAddForm();
            }}
            class="rounded-lg border border-brand/30 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/20"
          >
            + Add holding
          </button>
        {/if}
      </div>
    </div>

    {#if manualStore.holdings.length === 0 && !showAddForm}
      <div
        class="rounded-xl border border-border bg-surface-raised px-6 py-10 text-center sm:px-8 sm:py-12"
      >
        <p class="mb-3 text-sm text-text-secondary">No manual holdings yet</p>
        <button
          onclick={() => {
            showAddForm = true;
            resetAddForm();
          }}
          class="rounded-lg border border-brand/30 bg-brand/10 px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/20"
        >
          + Add your first holding
        </button>
      </div>
    {:else}
      <!-- Mobile: card layout -->
      <div class="flex flex-col gap-2 sm:hidden">
        {#each manualStore.holdings as h (h.id)}
          {#if editingId === h.id}
            <div
              class="rounded-xl border border-brand/30 bg-surface-raised p-4"
            >
              <div class="grid grid-cols-2 gap-3">
                <label class="block">
                  <span
                    class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                    >Symbol</span
                  >
                  <input
                    type="text"
                    bind:value={editForm.symbol}
                    class="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs uppercase"
                    placeholder="AAPL"
                  />
                </label>
                <label class="block">
                  <span
                    class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                    >Date</span
                  >
                  <input
                    type="date"
                    bind:value={editForm.buyDate}
                    class="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs"
                  />
                </label>
                <label class="block">
                  <span
                    class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                    >Buy Price</span
                  >
                  <input
                    type="number"
                    bind:value={editForm.buyPrice}
                    step="0.01"
                    min="0"
                    class="w-full rounded border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums"
                    placeholder="0.00"
                  />
                </label>
                <label class="block">
                  <span
                    class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                    >Units</span
                  >
                  <input
                    type="number"
                    bind:value={editForm.units}
                    step="0.0001"
                    min="0"
                    class="w-full rounded border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums"
                    placeholder="0"
                  />
                </label>
                <label class="col-span-2 block">
                  <span
                    class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                    >Source</span
                  >
                  <input
                    type="text"
                    bind:value={editForm.source}
                    class="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs"
                    placeholder="Broker"
                  />
                </label>
              </div>
              <div class="mt-3 flex items-center justify-between">
                <div class="text-xs text-text-secondary">
                  Invested:
                  {#if !isNaN(parseFloat(editForm.buyPrice)) && !isNaN(parseFloat(editForm.units))}
                    <Money
                      value={parseFloat(editForm.buyPrice) *
                        parseFloat(editForm.units)}
                    />
                  {:else}
                    --
                  {/if}
                </div>
                <div class="flex gap-2">
                  <button
                    onclick={cancelEdit}
                    class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
                    >Cancel</button
                  >
                  <button
                    onclick={saveEdit}
                    class="rounded-lg bg-gain/15 px-3 py-1.5 text-xs font-medium text-gain transition-colors hover:bg-gain/25"
                    >Save</button
                  >
                </div>
              </div>
            </div>
          {:else}
            <div
              class="rounded-xl border border-border bg-surface-raised px-4 py-3"
            >
              <div class="mb-2 flex items-baseline justify-between">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm font-medium">{h.symbol}</span>
                  {#if h.source}
                    <span class="text-xs text-text-secondary">{h.source}</span>
                  {/if}
                </div>
                <span class="text-xs text-text-secondary"
                  >{dateFmt.format(new Date(h.buyDate))}</span
                >
              </div>
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div class="text-text-secondary">Buy Price</div>
                <div class="text-right tabular-nums">
                  {currency.format(h.buyPrice)}
                </div>
                <div class="text-text-secondary">Units</div>
                <div class="text-right tabular-nums">
                  <span data-private>{h.units.toFixed(4)}</span>
                </div>
                <div class="text-text-secondary">Invested</div>
                <div class="text-right tabular-nums font-medium">
                  <Money value={h.buyPrice * h.units} />
                </div>
              </div>
              <div
                class="mt-2 flex justify-end gap-2 border-t border-border/20 pt-2"
              >
                <button
                  onclick={() => startEdit(h)}
                  class="rounded px-2.5 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                  >Edit</button
                >
                <button
                  onclick={() => handleDelete(h.id)}
                  class="rounded px-2.5 py-1 text-[11px] font-medium text-loss/70 transition-colors hover:bg-loss/10 hover:text-loss"
                  >Delete</button
                >
              </div>
            </div>
          {/if}
        {/each}

        {#if showAddForm}
          <div class="rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span
                  class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                  >Symbol</span
                >
                <input
                  type="text"
                  bind:value={addForm.symbol}
                  class="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs uppercase"
                  placeholder="AAPL"
                />
              </label>
              <label class="block">
                <span
                  class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                  >Date</span
                >
                <input
                  type="date"
                  bind:value={addForm.buyDate}
                  class="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs"
                />
              </label>
              <label class="block">
                <span
                  class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                  >Buy Price</span
                >
                <input
                  type="number"
                  bind:value={addForm.buyPrice}
                  step="0.01"
                  min="0"
                  class="w-full rounded border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums"
                  placeholder="0.00"
                />
              </label>
              <label class="block">
                <span
                  class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                  >Units</span
                >
                <input
                  type="number"
                  bind:value={addForm.units}
                  step="0.0001"
                  min="0"
                  class="w-full rounded border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums"
                  placeholder="0"
                />
              </label>
              <label class="col-span-2 block">
                <span
                  class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-secondary"
                  >Source</span
                >
                <input
                  type="text"
                  bind:value={addForm.source}
                  class="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs"
                  placeholder="Broker"
                />
              </label>
            </div>
            <div class="mt-3 flex items-center justify-between">
              <div class="text-xs text-text-secondary">
                Invested:
                {#if !isNaN(parseFloat(addForm.buyPrice)) && !isNaN(parseFloat(addForm.units)) && parseFloat(addForm.buyPrice) >= 0 && parseFloat(addForm.units) > 0}
                  <Money
                    value={parseFloat(addForm.buyPrice) *
                      parseFloat(addForm.units)}
                  />
                {:else}
                  --
                {/if}
              </div>
              <div class="flex gap-2">
                <button
                  onclick={() => {
                    showAddForm = false;
                  }}
                  class="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
                  >Cancel</button
                >
                <button
                  onclick={handleAdd}
                  class="rounded-lg bg-brand/15 px-3 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand/25"
                  >Add</button
                >
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Desktop: table layout -->
      <div
        class="hidden sm:block overflow-x-auto rounded-xl border border-border bg-surface-raised"
      >
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-border/50 text-[10px] font-medium uppercase tracking-wider text-text-secondary"
            >
              <th class="py-2.5 pl-4 pr-3 text-left">Symbol</th>
              <th class="px-3 py-2.5 text-left">Date</th>
              <th class="px-3 py-2.5 text-right">Buy Price</th>
              <th class="px-3 py-2.5 text-right">Units</th>
              <th class="px-3 py-2.5 text-right">Invested</th>
              <th class="px-3 py-2.5 text-left">Source</th>
              <th class="py-2.5 pl-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each manualStore.holdings as h (h.id)}
              {#if editingId === h.id}
                <tr class="border-b border-border/20 bg-surface-overlay/30">
                  <td class="py-2 pl-4 pr-3">
                    <input
                      type="text"
                      bind:value={editForm.symbol}
                      class="w-24 rounded border border-border bg-surface px-2 py-1 text-xs uppercase"
                      placeholder="AAPL"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="date"
                      bind:value={editForm.buyDate}
                      class="rounded border border-border bg-surface px-2 py-1 text-xs"
                    />
                  </td>
                  <td class="px-3 py-2 text-right">
                    <input
                      type="number"
                      bind:value={editForm.buyPrice}
                      step="0.01"
                      min="0"
                      class="w-24 rounded border border-border bg-surface px-2 py-1 text-right text-xs tabular-nums"
                      placeholder="0.00"
                    />
                  </td>
                  <td class="px-3 py-2 text-right">
                    <input
                      type="number"
                      bind:value={editForm.units}
                      step="0.0001"
                      min="0"
                      class="w-24 rounded border border-border bg-surface px-2 py-1 text-right text-xs tabular-nums"
                      placeholder="0"
                    />
                  </td>
                  <td
                    class="px-3 py-2 text-right tabular-nums text-text-secondary"
                  >
                    {#if !isNaN(parseFloat(editForm.buyPrice)) && !isNaN(parseFloat(editForm.units))}
                      <Money
                        value={parseFloat(editForm.buyPrice) *
                          parseFloat(editForm.units)}
                      />
                    {:else}
                      --
                    {/if}
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="text"
                      bind:value={editForm.source}
                      class="w-28 rounded border border-border bg-surface px-2 py-1 text-xs"
                      placeholder="Broker"
                    />
                  </td>
                  <td class="py-2 pl-3 pr-4">
                    <div class="flex justify-end gap-1">
                      <button
                        onclick={saveEdit}
                        class="rounded px-2 py-1 text-[10px] font-medium text-gain transition-colors hover:bg-gain/10"
                      >
                        Save
                      </button>
                      <button
                        onclick={cancelEdit}
                        class="rounded px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              {:else}
                <tr
                  class="border-b border-border/20 last:border-b-0 transition-colors hover:bg-surface-overlay/20"
                >
                  <td class="py-2 pl-4 pr-3 font-medium">{h.symbol}</td>
                  <td class="px-3 py-2 text-text-secondary">
                    {dateFmt.format(new Date(h.buyDate))}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {currency.format(h.buyPrice)}
                  </td>
                  <td
                    class="px-3 py-2 text-right tabular-nums text-text-secondary"
                  >
                    <span data-private>{h.units.toFixed(4)}</span>
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums font-medium">
                    <Money value={h.buyPrice * h.units} />
                  </td>
                  <td class="px-3 py-2 text-text-secondary">{h.source ?? ""}</td
                  >
                  <td class="py-2 pl-3 pr-4">
                    <div class="flex justify-end gap-1">
                      <button
                        onclick={() => startEdit(h)}
                        class="rounded px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
                      >
                        Edit
                      </button>
                      <button
                        onclick={() => handleDelete(h.id)}
                        class="rounded px-2 py-1 text-[10px] font-medium text-loss/70 transition-colors hover:bg-loss/10 hover:text-loss"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}

            {#if showAddForm}
              <tr class="border-t border-brand/20 bg-brand/5">
                <td class="py-2 pl-4 pr-3">
                  <input
                    type="text"
                    bind:value={addForm.symbol}
                    class="w-24 rounded border border-border bg-surface px-2 py-1 text-xs uppercase"
                    placeholder="AAPL"
                  />
                </td>
                <td class="px-3 py-2">
                  <input
                    type="date"
                    bind:value={addForm.buyDate}
                    class="rounded border border-border bg-surface px-2 py-1 text-xs"
                  />
                </td>
                <td class="px-3 py-2 text-right">
                  <input
                    type="number"
                    bind:value={addForm.buyPrice}
                    step="0.01"
                    min="0"
                    class="w-24 rounded border border-border bg-surface px-2 py-1 text-right text-xs tabular-nums"
                    placeholder="0.00"
                  />
                </td>
                <td class="px-3 py-2 text-right">
                  <input
                    type="number"
                    bind:value={addForm.units}
                    step="0.0001"
                    min="0"
                    class="w-24 rounded border border-border bg-surface px-2 py-1 text-right text-xs tabular-nums"
                    placeholder="0"
                  />
                </td>
                <td
                  class="px-3 py-2 text-right tabular-nums text-text-secondary"
                >
                  {#if !isNaN(parseFloat(addForm.buyPrice)) && !isNaN(parseFloat(addForm.units)) && parseFloat(addForm.buyPrice) >= 0 && parseFloat(addForm.units) > 0}
                    <Money
                      value={parseFloat(addForm.buyPrice) *
                        parseFloat(addForm.units)}
                    />
                  {:else}
                    --
                  {/if}
                </td>
                <td class="px-3 py-2">
                  <input
                    type="text"
                    bind:value={addForm.source}
                    class="w-28 rounded border border-border bg-surface px-2 py-1 text-xs"
                    placeholder="Broker"
                  />
                </td>
                <td class="py-2 pl-3 pr-4">
                  <div class="flex justify-end gap-1">
                    <button
                      onclick={handleAdd}
                      class="rounded px-2 py-1 text-[10px] font-medium text-brand transition-colors hover:bg-brand/10"
                    >
                      Add
                    </button>
                    <button
                      onclick={() => {
                        showAddForm = false;
                      }}
                      class="rounded px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  {#if etoroPositions.length > 0 || manualStore.holdings.length > 0}
    <section
      class="rounded-xl border border-border bg-surface-raised p-4 sm:p-5"
    >
      <h3 class="mb-3 text-sm font-medium text-text-secondary">
        Combined Summary
      </h3>
      <div
        class="grid grid-cols-1 gap-2 text-sm sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2"
      >
        {#if etoroPositions.length > 0}
          <div class="flex justify-between sm:block">
            <span class="text-text-secondary">eToro:</span>
            <span class="ml-1 font-medium"
              ><Money value={etoroTotalInvested} /></span
            >
          </div>
        {/if}
        {#if manualStore.holdings.length > 0}
          <div class="flex justify-between sm:block">
            <span class="text-text-secondary">Manual:</span>
            <span class="ml-1 font-medium"
              ><Money value={manualTotalInvested} /></span
            >
          </div>
        {/if}
        <div
          class="flex justify-between border-t border-border/30 pt-2 sm:border-0 sm:pt-0"
        >
          <span class="text-text-secondary">Total invested:</span>
          <span class="ml-1 font-semibold">
            <Money value={etoroTotalInvested + manualTotalInvested} />
          </span>
        </div>
      </div>
    </section>
  {/if}
</div>
