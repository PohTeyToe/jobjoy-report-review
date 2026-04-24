<script lang="ts">
  import { VARIANTS, type VariantSlug } from '../variants';
  import type { AdminFilters } from './admin-store.svelte';

  type Reviewer = { id: string; name: string };

  type Props = {
    filters: AdminFilters;
    reviewers: Reviewer[];
    onchange: (next: AdminFilters) => void;
  };

  const { filters, reviewers, onchange }: Props = $props();

  function toggleVariant(slug: VariantSlug): void {
    const next = filters.variants.includes(slug)
      ? filters.variants.filter((v) => v !== slug)
      : [...filters.variants, slug];
    onchange({ ...filters, variants: next });
  }

  function toggleReviewer(id: string): void {
    const next = filters.reviewerIds.includes(id)
      ? filters.reviewerIds.filter((r) => r !== id)
      : [...filters.reviewerIds, id];
    onchange({ ...filters, reviewerIds: next });
  }

  function setResolved(v: 'all' | 'open' | 'resolved'): void {
    onchange({ ...filters, resolved: v });
  }

  function setDateFrom(v: string): void {
    onchange({ ...filters, dateFrom: v || null });
  }

  function setDateTo(v: string): void {
    onchange({ ...filters, dateTo: v || null });
  }
</script>

<aside
  class="space-y-5 rounded-md border border-neutral-200 bg-white p-4"
  data-testid="pin-filters"
>
  <div>
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Variant</h3>
    <div class="space-y-1">
      {#each VARIANTS as v (v.slug)}
        <label class="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            data-testid={`filter-variant-${v.slug}`}
            checked={filters.variants.includes(v.slug)}
            onchange={() => toggleVariant(v.slug)}
            class="h-4 w-4 rounded border-neutral-300"
          />
          <span>{v.title}</span>
        </label>
      {/each}
    </div>
  </div>

  <div>
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Reviewer</h3>
    {#if reviewers.length === 0}
      <p class="text-xs italic text-neutral-500">No reviewers yet.</p>
    {:else}
      <div class="max-h-40 space-y-1 overflow-y-auto">
        {#each reviewers as r (r.id)}
          <label class="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              data-testid={`filter-reviewer-${r.id}`}
              checked={filters.reviewerIds.includes(r.id)}
              onchange={() => toggleReviewer(r.id)}
              class="h-4 w-4 rounded border-neutral-300"
            />
            <span class="truncate">{r.name}</span>
          </label>
        {/each}
      </div>
    {/if}
  </div>

  <div>
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</h3>
    <div class="flex gap-2 text-xs">
      {#each ['all', 'open', 'resolved'] as const as v (v)}
        <button
          type="button"
          data-testid={`filter-status-${v}`}
          onclick={() => setResolved(v)}
          class={`rounded-md border px-2 py-1 capitalize ${
            filters.resolved === v
              ? 'border-neutral-900 bg-neutral-900 text-white'
              : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
          }`}
        >
          {v}
        </button>
      {/each}
    </div>
  </div>

  <div>
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Date range</h3>
    <div class="space-y-2 text-xs">
      <label class="block">
        <span class="text-neutral-600">From</span>
        <input
          type="date"
          data-testid="filter-date-from"
          value={filters.dateFrom ?? ''}
          onchange={(e) => setDateFrom((e.currentTarget as HTMLInputElement).value)}
          class="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1"
        />
      </label>
      <label class="block">
        <span class="text-neutral-600">To</span>
        <input
          type="date"
          data-testid="filter-date-to"
          value={filters.dateTo ?? ''}
          onchange={(e) => setDateTo((e.currentTarget as HTMLInputElement).value)}
          class="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1"
        />
      </label>
    </div>
  </div>
</aside>
