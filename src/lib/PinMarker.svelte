<script lang="ts">
  type Props = {
    id: string;
    index: number;
    isOptimistic?: boolean;
    onopen?: (id: string) => void;
  };

  const { id, index, isOptimistic = false, onopen }: Props = $props();

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
</script>

<button
  type="button"
  data-testid="pin-marker"
  data-pin-id={id}
  data-optimistic={isOptimistic || null}
  aria-label={`Pin ${index}${isOptimistic ? ' (saving)' : ''}`}
  class="pointer-events-auto flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white shadow-md ring-1 ring-black/20 transition-transform hover:scale-110"
  style="background:{isOptimistic ? '#a3a3a3' : '#dc2626'};"
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  {index}
</button>
