<script lang="ts">
  type Props = {
    /** Document-coordinate position (already scrolled-adjusted). */
    left: number;
    top: number;
    onsubmit?: (body: string) => void;
    oncancel?: () => void;
  };

  const { left, top, onsubmit, oncancel }: Props = $props();

  let body = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let containerEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    textareaEl?.focus();
  });

  function submit(): void {
    const trimmed = body.trim();
    if (!trimmed) return;
    onsubmit?.(trimmed);
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel?.();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleDocClick(e: MouseEvent): void {
    if (!containerEl) return;
    const target = e.target as Node | null;
    if (target && containerEl.contains(target)) return;
    oncancel?.();
  }

  $effect(() => {
    // Capture-phase so we win against the variant's own click handler.
    const opts: AddEventListenerOptions = { capture: true };
    document.addEventListener('mousedown', handleDocClick, opts);
    return () => document.removeEventListener('mousedown', handleDocClick, opts);
  });
</script>

<div
  bind:this={containerEl}
  data-testid="pin-composer"
  class="absolute z-30 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-xl"
  style="left:{left}px;top:{top}px;transform:translate(8px, 8px);"
  role="dialog"
  aria-label="New pin comment"
>
  <textarea
    bind:this={textareaEl}
    bind:value={body}
    onkeydown={handleKey}
    rows="3"
    placeholder="Leave a comment… (Enter to send, Esc to cancel)"
    aria-label="Comment body"
    data-testid="pin-composer-input"
    class="w-full resize-none rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
  ></textarea>
  <div class="mt-2 flex justify-end gap-2">
    <button
      type="button"
      onclick={() => oncancel?.()}
      data-testid="pin-composer-cancel"
      class="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100"
    >
      Cancel
    </button>
    <button
      type="button"
      onclick={submit}
      disabled={!body.trim()}
      data-testid="pin-composer-submit"
      class="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
    >
      Comment
    </button>
  </div>
</div>
