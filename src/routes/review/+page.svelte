<script lang="ts">
  import { page } from '$app/state';
  import { VARIANTS, type VariantSlug } from '$lib/variants';

  const variant = $derived((page.url.searchParams.get('variant') ?? 'recommended') as VariantSlug);
</script>

<main class="min-h-screen">
  <header class="sticky top-0 z-10 border-b bg-white/90 px-4 py-3 backdrop-blur">
    <div class="mx-auto flex max-w-6xl items-center gap-2">
      <a href="/" class="text-sm text-neutral-500 hover:text-neutral-900">← Home</a>
      <div class="ml-4 flex gap-1">
        {#each VARIANTS as v, i}
          <a
            href={`/review?variant=${v.slug}`}
            class="rounded-full px-3 py-1 text-sm {variant === v.slug
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-600 hover:bg-neutral-100'}"
          >
            {i + 1}. {v.slug}
          </a>
        {/each}
      </div>
    </div>
  </header>

  <section class="mx-auto max-w-6xl px-4 py-8">
    <p class="text-neutral-500">Phase 0 placeholder. Variant: <strong>{variant}</strong></p>
    <p class="mt-2 text-sm text-neutral-400">
      Shadow-DOM variant rendering and pin-drop arrive in Phase 1 &amp; 2.
    </p>
  </section>
</main>
