<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { VARIANTS, type VariantSlug } from '$lib/variants';
  import VariantRenderer from '$lib/VariantRenderer.svelte';
  import VariantSwitcher from '$lib/VariantSwitcher.svelte';
  import PinOverlay from '$lib/PinOverlay.svelte';
  import PinComposer from '$lib/PinComposer.svelte';
  import NameModal from '$lib/NameModal.svelte';
  import { findClosestPageToCenter, scrollToPageIndex } from '$lib/page-sync';
  import { getIdentity, bumpLastSeen, type Identity } from '$lib/identity';
  import { createPinStore } from '$lib/pin-store.svelte';

  const SLUGS = VARIANTS.map((v) => v.slug);

  function readVariant(): VariantSlug {
    const raw = page.url.searchParams.get('variant');
    return (SLUGS as string[]).includes(raw ?? '') ? (raw as VariantSlug) : 'recommended';
  }

  function readPage(): number {
    const raw = page.url.searchParams.get('page');
    const n = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  let variant: VariantSlug = $state(readVariant());
  let pageIdx: number = $state(readPage());
  let renderer = $state<ReturnType<typeof VariantRenderer> | null>(null);
  let pendingPage: number | null = readPage();
  let suppressUrlWrite = false;
  let skipNextReady = false;

  let identity = $state<Identity | null>(null);
  let needsName = $state(false);
  const pinStore = createPinStore();

  type PendingDrop = {
    variant: VariantSlug;
    page_index: number;
    x_pct: number;
    y_pct: number;
    left: number;
    top: number;
  };
  let pending = $state<PendingDrop | null>(null);

  let shadowRoot = $state<ShadowRoot | null>(null);

  function getShadowRoot(): ShadowRoot | null {
    return renderer?.getShadow() ?? null;
  }

  function refreshShadow(): void {
    shadowRoot = getShadowRoot();
  }

  function writeUrl(nextVariant: VariantSlug, nextPage: number): void {
    if (suppressUrlWrite) return;
    const url = new URL(page.url);
    url.searchParams.set('variant', nextVariant);
    url.searchParams.set('page', String(nextPage));
    void goto(`${url.pathname}${url.search}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }

  function onVariantChange(slug: VariantSlug): void {
    if (slug === variant) return;
    const root = getShadowRoot();
    if (root) {
      pendingPage = findClosestPageToCenter(root);
    } else {
      pendingPage = pageIdx;
    }
    variant = slug;
    pending = null;
    writeUrl(slug, pendingPage ?? 0);
    void pinStore.loadPins(slug);
  }

  function onRendererReady(): void {
    if (skipNextReady) {
      skipNextReady = false;
      const root = getShadowRoot();
      if (root && pendingPage !== null) {
        scrollToPageIndex(root, pendingPage);
        pageIdx = pendingPage;
      }
      pendingPage = null;
      refreshShadow();
      return;
    }
    const root = getShadowRoot();
    if (root && pendingPage !== null) {
      const landed = scrollToPageIndex(root, pendingPage);
      pageIdx = landed;
      writeUrl(variant, landed);
    }
    pendingPage = null;
    refreshShadow();
  }

  function onPageClick(detail: {
    variant: VariantSlug;
    page_index: number;
    x_pct: number;
    y_pct: number;
  }): void {
    pageIdx = detail.page_index;
    writeUrl(detail.variant, detail.page_index);

    if (!identity) {
      // Without an identity we can't drop a pin yet — surface the modal.
      needsName = true;
      return;
    }

    const root = getShadowRoot();
    const pageEl = root?.querySelector(
      `.page[data-page-index="${detail.page_index}"]`
    ) as HTMLElement | null;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const rawLeft = rect.left + window.scrollX + (rect.width * detail.x_pct) / 100;
    const rawTop = rect.top + window.scrollY + (rect.height * detail.y_pct) / 100;
    const POPOVER_W = 296;
    const POPOVER_H = 160;
    const maxLeft = window.scrollX + window.innerWidth - POPOVER_W;
    const maxTop = window.scrollY + window.innerHeight - POPOVER_H;
    const left = Math.max(0, Math.min(rawLeft, maxLeft));
    const top = Math.max(0, Math.min(rawTop, maxTop));
    pending = {
      variant: detail.variant,
      page_index: detail.page_index,
      x_pct: detail.x_pct,
      y_pct: detail.y_pct,
      left,
      top
    };
  }

  async function submitComposer(body: string): Promise<void> {
    if (!pending || !identity) return;
    const drop = pending;
    pending = null;
    try {
      await pinStore.dropPin({
        variant: drop.variant,
        page_index: drop.page_index,
        x_pct: drop.x_pct,
        y_pct: drop.y_pct,
        body,
        reviewer: { id: identity.id, name: identity.name }
      });
    } catch (err) {
      console.error('[review] dropPin failed:', err);
    }
  }

  function cancelComposer(): void {
    pending = null;
  }

  function onIdentity(next: Identity): void {
    identity = next;
    needsName = false;
    void pinStore.loadPins(variant);
  }

  onMount(() => {
    const existing = getIdentity();
    if (existing) {
      identity = existing;
      void bumpLastSeen();
      void pinStore.loadPins(variant);
    } else {
      needsName = true;
    }

    const onPop = () => {
      const v = readVariant();
      const p = readPage();
      if (v !== variant) {
        skipNextReady = true;
        pendingPage = p;
        variant = v;
        void pinStore.loadPins(v);
      } else {
        suppressUrlWrite = true;
        const root = getShadowRoot();
        if (root) scrollToPageIndex(root, p);
        pageIdx = p;
        suppressUrlWrite = false;
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });
</script>

<main class="relative min-h-screen">
  <header class="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center gap-4">
      <a href="/" class="text-sm text-neutral-500 hover:text-neutral-900">← Home</a>
      <VariantSwitcher active={variant} onvariantchange={onVariantChange} />
      {#if identity}
        <span class="ml-auto text-xs text-neutral-500" data-testid="reviewer-name">
          Reviewing as <span class="font-medium text-neutral-700">{identity.name}</span>
        </span>
      {/if}
    </div>
  </header>

  <section class="mx-auto max-w-6xl px-0 py-4">
    <VariantRenderer
      bind:this={renderer}
      {variant}
      onready={onRendererReady}
      onpageclick={onPageClick}
    />
  </section>

  <PinOverlay pins={pinStore.pins} {shadowRoot} />

  {#if pending}
    <PinComposer
      left={pending.left}
      top={pending.top}
      onsubmit={submitComposer}
      oncancel={cancelComposer}
    />
  {/if}

  {#if needsName}
    <NameModal onidentity={onIdentity} />
  {/if}
</main>
