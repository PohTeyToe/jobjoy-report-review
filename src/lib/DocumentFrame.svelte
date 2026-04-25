<script lang="ts">
  // PDF-style chrome around <VariantRenderer>. Pin coords are anchored to the .page
  // rects INSIDE the shadow root, so this outer frame can't shift them.
  type Props = {
    title: string;
    pageCount: number;
    pageIndex: number;
    children?: import('svelte').Snippet;
  };

  const { title, pageCount, pageIndex, children }: Props = $props();

  const hasPages = $derived(pageCount > 0);
  // pageIndex is 0-based internally; humans want 1-based.
  const displayPage = $derived(Math.min(Math.max(pageIndex + 1, 1), Math.max(pageCount, 1)));
</script>

<div class="bg-neutral-100 px-3 py-6 sm:px-6 sm:py-8" data-testid="document-frame">
  <div
    class="mx-auto w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.12)]"
    style="max-width: 8.5in;"
  >
    <div
      class="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/80 px-4 py-2 text-xs"
      data-testid="document-frame-header"
    >
      <span
        aria-hidden="true"
        class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-neutral-900 text-[8px] font-bold uppercase tracking-wide text-white"
        title="PDF document"
      >
        PDF
      </span>
      <span class="truncate font-medium text-neutral-700" data-testid="document-frame-title">
        {title}
      </span>
      {#if hasPages}
        <span
          class="ml-auto shrink-0 tabular-nums text-neutral-500"
          data-testid="document-frame-page-indicator"
        >
          Page {displayPage} of {pageCount}
        </span>
      {/if}
    </div>

    <div class="bg-white">
      {@render children?.()}
    </div>
  </div>
</div>
