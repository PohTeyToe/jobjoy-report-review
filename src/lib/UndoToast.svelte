<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  /**
   * Undo toast — fixed bottom-center, drop-shadow, role=status / aria-live=polite.
   * Auto-dismisses after `duration` ms (default 5000) unless the user clicks Undo.
   *
   * Single-instance pattern: the parent route mounts this conditionally. When a
   * new delete happens while an old toast is still visible, the parent should
   * synchronously commit the old delete (call dismiss / replace state) so the
   * outgoing instance never lingers as a zombie undo target.
   */

  type Props = {
    message: string;
    duration?: number;
    onUndo: () => void;
    onDismiss: () => void;
  };

  const { message, duration = 5000, onUndo, onDismiss }: Props = $props();

  let timer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    timer = setTimeout(() => {
      timer = null;
      onDismiss();
    }, duration);
  });

  onDestroy(() => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  function handleUndo(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    onUndo();
  }
</script>

<div
  data-testid="undo-toast"
  role="status"
  aria-live="polite"
  class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-4 py-2 text-sm text-white shadow-2xl"
>
  <span data-testid="undo-toast-message">{message}</span>
  <button
    type="button"
    data-testid="undo-toast-undo"
    onclick={handleUndo}
    class="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
  >
    Undo
  </button>
</div>
