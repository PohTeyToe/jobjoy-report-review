<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { VARIANTS, type VariantSlug } from './variants';

  type Props = {
    active: VariantSlug;
    onvariantchange?: (slug: VariantSlug) => void;
  };

  const { active, onvariantchange }: Props = $props();

  function select(slug: VariantSlug): void {
    if (slug === active) return;
    onvariantchange?.(slug);
  }

  function handleKey(e: KeyboardEvent): void {
    // Ignore shortcuts when the user is typing in a field.
    const t = e.target as HTMLElement | null;
    if (t) {
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number.parseInt(e.key, 10);
    if (!Number.isFinite(n) || n < 1 || n > VARIANTS.length) return;
    const target = VARIANTS[n - 1];
    if (target) {
      e.preventDefault();
      select(target.slug);
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKey);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKey);
    }
  });
</script>

<nav class="variant-switcher flex gap-1" aria-label="Variant switcher">
  {#each VARIANTS as v, i}
    {@const isActive = v.slug === active}
    <button
      type="button"
      data-testid="variant-chip"
      data-slug={v.slug}
      data-active={isActive ? 'true' : 'false'}
      class="chip rounded-full px-3 py-1 text-sm {isActive
        ? 'chip-active bg-neutral-900 text-white'
        : 'text-neutral-600 hover:bg-neutral-100'}"
      aria-pressed={isActive}
      title={`${v.title} — press ${i + 1}`}
      onclick={() => select(v.slug)}
    >
      <span class="mr-1 text-xs opacity-60">{i + 1}.</span>{v.title}
    </button>
  {/each}
</nav>
