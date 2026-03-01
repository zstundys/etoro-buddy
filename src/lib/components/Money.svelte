<script lang="ts">
  import { currency, pnlSign, pnlColor } from "$lib/format";

  type Props = {
    value: number;
    showSign?: boolean;
    abs?: boolean;
    signOverride?: string;
    public?: boolean;
    class?: string;
  };

  let {
    value,
    showSign = false,
    abs = false,
    signOverride,
    public: isPublic = false,
    class: cls = "",
  }: Props = $props();

  const display = $derived.by(() => {
    const v = abs ? Math.abs(value) : value;
    const sign = signOverride ?? (showSign ? pnlSign(value) : "");
    return `${sign}${currency.format(v)}`;
  });

  const color = $derived(showSign ? pnlColor(value) : "");
</script>

<span data-private={isPublic ? undefined : ""} class="{color} {cls}">{display}</span>
