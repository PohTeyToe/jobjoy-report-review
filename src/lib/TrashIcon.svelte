<script lang="ts">
  /**
   * Inline trash icon (heroicons mini "trash"). Extracted from PinMarker
   * + ThreadPanel so future tweaks happen in one place. Per Claude
   * review #5.
   */
  type Props = {
    /** Tailwind size classes (e.g. "h-3.5 w-3.5"). Defaults to h-3.5 w-3.5. */
    class?: string;
  };
  const { class: cls = 'h-3.5 w-3.5' }: Props = $props();
</script>

<svg
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={cls}
  aria-hidden="true"
>
  <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 8a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4" />
</svg>
