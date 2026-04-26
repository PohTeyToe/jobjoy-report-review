<script lang="ts">
  type Props = {
    id: string;
    index: number;
    isOptimistic?: boolean;
    isResolved?: boolean;
    canDelete?: boolean;
    onopen?: (id: string) => void;
    ondelete?: (id: string) => void;
  };

  const {
    id,
    index,
    isOptimistic = false,
    isResolved = false,
    canDelete = false,
    onopen,
    ondelete
  }: Props = $props();

  function handleClick(e: MouseEvent): void {
    e.stopPropagation();
    onopen?.(id);
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onopen?.(id);
    }
  }

  function handleDelete(e: MouseEvent): void {
    // Don't open the thread when the trash chip is clicked.
    e.stopPropagation();
    e.preventDefault();
    ondelete?.(id);
  }

  function handleDeleteKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      ondelete?.(id);
    }
  }
</script>

<div class="pointer-events-auto relative inline-block -translate-x-1/2 -translate-y-1/2">
  <button
    type="button"
    data-testid="pin-marker"
    data-pin-id={id}
    data-optimistic={isOptimistic || null}
    data-resolved={isResolved ? 'true' : null}
    aria-label={`Pin ${index}${isOptimistic ? ' (saving)' : ''}${isResolved ? ' (resolved)' : ''}`}
    class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md ring-1 ring-black/20 transition-transform hover:scale-110"
    style="background:{isOptimistic
      ? '#a3a3a3'
      : isResolved
        ? '#10b981'
        : '#dc2626'};opacity:{isResolved ? 0.7 : 1};"
    onclick={handleClick}
    onkeydown={handleKeydown}
  >
    {index}
  </button>

  {#if canDelete && !isOptimistic}
    <!--
      Author-only trash chip. Positioned at the marker's top-right corner,
      slightly outside the body so it doesn't obscure the index. Hidden for
      optimistic pins (no real id to delete yet).
    -->
    <button
      type="button"
      data-testid="pin-delete"
      data-pin-id={id}
      aria-label={`Delete pin ${index}`}
      title="Delete pin"
      class="absolute -right-2 -top-2 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-white bg-neutral-900 text-white shadow-sm hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      onclick={handleDelete}
      onkeydown={handleDeleteKeydown}
    >
      <!-- Heroicons mini "trash" path, scaled to fit the chip. -->
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-2.5 w-2.5"
        aria-hidden="true"
      >
        <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 8a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4" />
      </svg>
    </button>
  {/if}
</div>
