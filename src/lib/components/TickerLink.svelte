<script lang="ts">
  let {
    symbol,
    class: className = "",
  }: {
    symbol: string;
    class?: string;
  } = $props();

  const href = $derived(
    `https://www.etoro.com/markets/${symbol.toLowerCase()}`,
  );
</script>

<a
  {href}
  target="_blank"
  rel="noopener noreferrer"
  class="hover:text-brand hover:underline transition-colors {className}"
  onclick={(e) => e.stopPropagation()}
>
  {symbol}
</a>
