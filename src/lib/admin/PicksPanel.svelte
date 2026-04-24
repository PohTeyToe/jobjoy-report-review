<script lang="ts">
  import { VARIANTS, type VariantSlug } from '../variants';
  import type { AdminPick } from './admin-store.svelte';

  type Props = {
    picks: AdminPick[];
  };

  const { picks }: Props = $props();

  const grouped = $derived.by(() => {
    const m = new Map<VariantSlug, AdminPick[]>();
    for (const p of picks) {
      const arr = m.get(p.variant) ?? [];
      arr.push(p);
      m.set(p.variant, arr);
    }
    return m;
  });
</script>

<section
  class="rounded-md border border-neutral-200 bg-white p-4"
  data-testid="picks-panel"
  aria-label="Variant picks summary"
>
  <h2 class="mb-3 text-sm font-semibold text-neutral-900">Variant picks</h2>
  {#if picks.length === 0}
    <p class="text-xs italic text-neutral-500">No reviewers have submitted picks yet.</p>
  {:else}
    <ul class="space-y-3">
      {#each VARIANTS as v (v.slug)}
        {@const list = grouped.get(v.slug) ?? []}
        {#if list.length > 0}
          <li data-testid={`picks-variant-${v.slug}`}>
            <div class="text-sm font-medium text-neutral-800">
              {list.length} reviewer{list.length === 1 ? '' : 's'} picked
              <span class="text-neutral-900">{v.title}</span>
            </div>
            <ul class="mt-1 space-y-1 text-xs text-neutral-600">
              {#each list as pk (pk.reviewer_id + pk.ranking)}
                <li>
                  <span class="font-medium text-neutral-800">{pk.reviewer_name ?? '—'}</span>
                  <span class="text-neutral-500">(rank {pk.ranking})</span>
                  {#if pk.notes}
                    — {pk.notes}
                  {/if}
                </li>
              {/each}
            </ul>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</section>
