<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { VARIANTS, type VariantSlug } from '$lib/variants';
  import VariantRenderer from '$lib/VariantRenderer.svelte';
  import VariantSwitcher from '$lib/VariantSwitcher.svelte';
  import { findClosestPageToCenter, scrollToPageIndex } from '$lib/page-sync';

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

  function getShadowRoot(): ShadowRoot | null {
    return renderer?.getShadow() ?? null;
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
    // Snapshot current scroll position before swap.
    const root = getShadowRoot();
    if (root) {
      pendingPage = findClosestPageToCenter(root);
    } else {
      pendingPage = pageIdx;
    }
    variant = slug;
    writeUrl(slug, pendingPage ?? 0);
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
      return;
    }
    const root = getShadowRoot();
    if (root && pendingPage !== null) {
      const landed = scrollToPageIndex(root, pendingPage);
      pageIdx = landed;
      writeUrl(variant, landed);
    }
    pendingPage = null;
  }

  function onPageClick(detail: {
    variant: VariantSlug;
    page_index: number;
    x_pct: number;
    y_pct: number;
  }): void {
    // Phase 2 will open the pin composer here.
    pageIdx = detail.page_index;
    writeUrl(detail.variant, detail.page_index);
  }

  // Back/forward should resync component state without writing a new URL.
  onMount(() => {
    const onPop = () => {
      const v = readVariant();
      const p = readPage();
      if (v !== variant) {
        // Variant change triggers an async re-mount; defer the "don't write
        // URL" flag to onRendererReady via skipNextReady.
        skipNextReady = true;
        pendingPage = p;
        variant = v;
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

<main class="min-h-screen">
  <header class="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center gap-4">
      <a href="/" class="text-sm text-neutral-500 hover:text-neutral-900">← Home</a>
      <VariantSwitcher active={variant} onvariantchange={onVariantChange} />
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
</main>
