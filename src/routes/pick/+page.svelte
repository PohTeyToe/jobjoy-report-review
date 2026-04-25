<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import NameModal from '$lib/NameModal.svelte';
  import { getIdentity, bumpLastSeen, type Identity } from '$lib/identity';
  import { VARIANTS, type Variant, type VariantSlug } from '$lib/variants';
  import { createPickStore } from '$lib/pick-store.svelte';

  const VARIANT_BY_SLUG = Object.fromEntries(VARIANTS.map((v) => [v.slug, v])) as Record<
    VariantSlug,
    Variant
  >;

  const store = createPickStore();
  let identity = $state<Identity | null>(null);
  let needsName = $state(false);
  let dragIndex = $state<number | null>(null);
  let overIndex = $state<number | null>(null);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let dragAnnouncement = $state('');

  function showToast(text: string): void {
    toast = text;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 3000);
  }

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  function onDragStart(e: DragEvent, index: number): void {
    dragIndex = index;
    const slug = store.ranking[index];
    const v = slug ? VARIANT_BY_SLUG[slug] : null;
    if (v) dragAnnouncement = `Moving ${v.title}. Drop to place.`;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to fire dragover/drop unless setData is called.
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function onDragOver(e: DragEvent, index: number): void {
    // preventDefault is REQUIRED to allow a drop on this element.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    overIndex = index;
  }

  function onDragLeave(index: number): void {
    if (overIndex === index) overIndex = null;
  }

  function onDrop(e: DragEvent, index: number): void {
    e.preventDefault();
    if (dragIndex === null) return;
    store.reorder(dragIndex, index);
    dragIndex = null;
    overIndex = null;
    dragAnnouncement = '';
  }

  function onDragEnd(): void {
    dragIndex = null;
    overIndex = null;
    dragAnnouncement = '';
  }

  function onCardClick(slug: VariantSlug): void {
    store.promoteToTop(slug);
  }

  function onCardKeydown(e: KeyboardEvent, index: number): void {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      store.reorder(index, index - 1);
      // Keep focus on the moved card.
      queueFocus(index - 1);
    } else if (e.key === 'ArrowDown' && index < store.ranking.length - 1) {
      e.preventDefault();
      store.reorder(index, index + 1);
      queueFocus(index + 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      // Activate = promote to top, matching the click behaviour.
      const slug = store.ranking[index];
      if (slug) {
        e.preventDefault();
        store.promoteToTop(slug);
        queueFocus(0);
      }
    }
  }

  function queueFocus(targetIndex: number): void {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pick-card"][data-index="${targetIndex}"]`
      );
      el?.focus();
    });
  }

  async function onSubmit(): Promise<void> {
    if (!identity || store.submitting) return;
    try {
      await store.submit(identity.id);
      showToast('Picks saved. Thanks!');
    } catch (err) {
      console.error('[pick] submit failed:', err);
    }
  }

  function onIdentity(next: Identity): void {
    identity = next;
    needsName = false;
    void store.loadExisting(next.id);
  }

  onMount(() => {
    const existing = getIdentity();
    if (existing) {
      identity = existing;
      void bumpLastSeen();
      void store.loadExisting(existing.id);
    } else {
      needsName = true;
    }
  });
</script>

<main class="mx-auto max-w-3xl px-6 py-12">
  <div aria-live="polite" aria-atomic="true" class="sr-only">{dragAnnouncement}</div>
  <header class="mb-8">
    <a href="/" class="text-sm text-neutral-500 hover:text-neutral-900">← Home</a>
    <h1 class="mt-4 text-4xl font-semibold tracking-tight">Pick your favourite Sample 1 design</h1>
    <p class="mt-3 text-lg text-neutral-600">
      Rank the variants you'd want George to ship. Reorder by drag, or click a variant to mark it
      your top pick.
    </p>
    {#if identity}
      <p class="mt-3 text-xs text-neutral-500" data-testid="reviewer-name">
        Picking as <span class="font-medium text-neutral-700">{identity.name}</span>
      </p>
    {/if}
  </header>

  {#if store.loading}<p class="text-sm text-neutral-500">Loading your previous picks…</p>{/if}
  <ol
    role="listbox"
    aria-label="Variant ranking — top of list is rank 1"
    class="space-y-3"
    data-testid="pick-list"
  >
    {#each store.ranking as slug, index (slug)}
      {@const v = VARIANT_BY_SLUG[slug]}
      <li
        role="option"
        aria-selected={index === 0}
        tabindex="0"
        draggable="true"
        aria-label={`Rank ${index + 1}: ${v.title}. Press arrow up or down to move, enter to promote to top.`}
        data-testid="pick-card"
        data-slug={slug}
        data-index={index}
        data-rank={index + 1}
        data-dragging={dragIndex === index}
        data-over={overIndex === index}
        ondragstart={(e) => onDragStart(e, index)}
        ondragover={(e) => onDragOver(e, index)}
        ondragleave={() => onDragLeave(index)}
        ondrop={(e) => onDrop(e, index)}
        ondragend={onDragEnd}
        onclick={() => onCardClick(slug)}
        onkeydown={(e) => onCardKeydown(e, index)}
        class="group flex cursor-grab items-stretch gap-0 overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm outline-none transition hover:border-neutral-400 hover:shadow-md focus-visible:ring-2 focus-visible:ring-neutral-900/40 active:cursor-grabbing data-[dragging=true]:opacity-50 data-[over=true]:border-neutral-900"
      >
        <div
          class="w-2 shrink-0"
          style={`background: linear-gradient(180deg, ${v.accent}, ${v.accentTo})`}
          aria-hidden="true"
        ></div>
        <div class="flex flex-1 items-center gap-4 px-5 py-4">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white"
            aria-hidden="true"
            data-testid="pick-rank-badge"
          >
            {index + 1}
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-neutral-900">{v.title}</div>
            <div class="text-sm text-neutral-600">{v.tagline}</div>
          </div>
          <div
            class="select-none text-2xl text-neutral-300 group-hover:text-neutral-500"
            aria-hidden="true"
            data-testid="pick-drag-handle"
          >
            ≡
          </div>
        </div>
      </li>
    {/each}
  </ol>

  <label class="mt-8 block">
    <span class="text-sm font-medium text-neutral-800">Overall thoughts (optional)</span>
    <textarea
      bind:value={store.notes}
      rows="4"
      placeholder="What stood out? What should George keep, drop, or push further?"
      data-testid="pick-notes"
      class="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
    ></textarea>
  </label>

  <div class="mt-6 flex items-center gap-4">
    <button
      type="button"
      onclick={onSubmit}
      disabled={!identity || store.submitting}
      data-testid="pick-submit"
      class="rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {store.submitting ? 'Saving…' : store.submitted ? 'Update my picks' : 'Save my picks'}
    </button>
    {#if store.submitted && !store.submitError}
      <span class="text-sm text-neutral-500" data-testid="pick-submitted-flag">
        Saved — you can update any time.
      </span>
    {/if}
    {#if store.submitError}
      <span
        class="flex items-center gap-2 text-sm text-red-600"
        role="alert"
        data-testid="pick-error"
      >
        {store.submitError}
        <button
          type="button"
          onclick={() => void onSubmit()}
          data-testid="pick-error-retry"
          class="rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Try again
        </button>
      </span>
    {/if}
  </div>

  {#if toast}
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2 text-sm text-white shadow-lg"
      role="status"
      data-testid="pick-toast"
    >
      {toast}
    </div>
  {/if}
</main>

{#if needsName}
  <NameModal onidentity={onIdentity} />
{/if}
