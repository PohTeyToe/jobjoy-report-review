<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PinMarker from './PinMarker.svelte';
  import type { Pin } from './pin-store.svelte';

  type Props = {
    pins: Pin[];
    shadowRoot: ShadowRoot | null;
    /**
     * Currently-signed-in reviewer id. Used to gate the trash chip on each
     * marker — only the author sees it. Pass `null` for unauthenticated
     * surfaces (e.g. admin secret URL with no NameModal flow).
     */
    currentReviewerId?: string | null;
    onopen?: (id: string) => void;
    ondelete?: (id: string) => void;
  };

  const { pins, shadowRoot, currentReviewerId = null, onopen, ondelete }: Props = $props();

  type Positioned = { pin: Pin; left: number; top: number; index: number };

  let positioned = $state<Positioned[]>([]);
  let rafQueued = false;

  function recompute(): void {
    rafQueued = false;
    const root = shadowRoot;
    if (!root) {
      positioned = [];
      return;
    }
    // Number pins per page in the order they were created. The store keeps
    // pins sorted by created_at ascending, so page-local indices fall out of
    // a simple counter.
    const perPageCounter = new Map<number, number>();
    const next: Positioned[] = [];
    for (const pin of pins) {
      const pageEl = root.querySelector(
        `.page[data-page-index="${pin.page_index}"]`
      ) as HTMLElement | null;
      if (!pageEl) continue;
      const rect = pageEl.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const left = rect.left + window.scrollX + (rect.width * pin.x_pct) / 100;
      const top = rect.top + window.scrollY + (rect.height * pin.y_pct) / 100;
      const idx = (perPageCounter.get(pin.page_index) ?? 0) + 1;
      perPageCounter.set(pin.page_index, idx);
      next.push({ pin, left, top, index: idx });
    }
    positioned = next;
  }

  function schedule(): void {
    if (rafQueued) return;
    rafQueued = true;
    requestAnimationFrame(recompute);
  }

  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => schedule());
      resizeObserver.observe(document.documentElement);
    }
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => schedule()).catch(() => {});
    }
    schedule();
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  // Recompute whenever pins or shadowRoot change.
  $effect(() => {
    // Touch reactive deps so Svelte tracks them.
    void pins;
    void shadowRoot;
    schedule();
  });
</script>

<div
  data-testid="pin-overlay"
  aria-hidden="false"
  class="pointer-events-none absolute left-0 top-0 z-20"
  style="width:0;height:0;"
>
  {#each positioned as p (p.pin.id)}
    <div
      class="absolute"
      style="left:{p.left}px;top:{p.top}px;"
      data-testid="pin-position"
      data-pin-id={p.pin.id}
    >
      <PinMarker
        id={p.pin.id}
        index={p.index}
        isOptimistic={p.pin.isOptimistic}
        isResolved={p.pin.resolved_at != null}
        canDelete={!!currentReviewerId && p.pin.reviewer_id === currentReviewerId}
        {onopen}
        {ondelete}
      />
    </div>
  {/each}
</div>
