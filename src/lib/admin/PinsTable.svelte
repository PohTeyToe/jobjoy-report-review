<script lang="ts">
  import { VARIANTS } from '../variants';
  import type { AdminPin } from './admin-store.svelte';

  type Props = {
    pins: AdminPin[];
    onopen: (pin: AdminPin) => void;
  };

  const { pins, onopen }: Props = $props();

  let sortKey = $state<'created_at' | 'variant' | 'page' | 'reviewer'>('created_at');
  let sortDir = $state<'asc' | 'desc'>('desc');

  function variantTitle(slug: string): string {
    return VARIANTS.find((v) => v.slug === slug)?.title ?? slug;
  }

  function setSort(key: typeof sortKey): void {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = key === 'created_at' ? 'desc' : 'asc';
    }
  }

  const sorted = $derived(
    [...pins].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      else if (sortKey === 'variant') cmp = a.variant.localeCompare(b.variant);
      else if (sortKey === 'page') cmp = a.page_index - b.page_index;
      else if (sortKey === 'reviewer')
        cmp = (a.reviewer_name ?? '').localeCompare(b.reviewer_name ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    })
  );

  function relTime(ts: string): string {
    const t = new Date(ts).getTime();
    const now = Date.now();
    const s = Math.round((now - t) / 1000);
    if (Number.isNaN(s)) return ts;
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  }

  function truncate(s: string | undefined, n: number): string {
    if (!s) return '—';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
</script>

<div
  class="overflow-x-auto rounded-md border border-neutral-200 bg-white"
  data-testid="pins-table-wrapper"
>
  <table class="min-w-full text-sm" data-testid="pins-table">
    <thead class="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
      <tr>
        <th class="cursor-pointer px-3 py-2 text-left" onclick={() => setSort('variant')}
          >Variant</th
        >
        <th class="cursor-pointer px-3 py-2 text-left" onclick={() => setSort('page')}>Page</th>
        <th class="cursor-pointer px-3 py-2 text-left" onclick={() => setSort('reviewer')}
          >Reviewer</th
        >
        <th class="px-3 py-2 text-left">First comment</th>
        <th class="px-3 py-2 text-left">Replies</th>
        <th class="px-3 py-2 text-left">Resolved</th>
        <th class="cursor-pointer px-3 py-2 text-left" onclick={() => setSort('created_at')}
          >Created</th
        >
      </tr>
    </thead>
    <tbody>
      {#each sorted as p (p.id)}
        <tr
          data-testid="pin-row"
          data-pin-id={p.id}
          tabindex="0"
          role="button"
          onclick={() => onopen(p)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onopen(p);
            }
          }}
          class="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
        >
          <td class="px-3 py-2 text-neutral-800">{variantTitle(p.variant)}</td>
          <td class="px-3 py-2 text-neutral-700">{p.page_index + 1}</td>
          <td class="px-3 py-2 text-neutral-700">{p.reviewer_name ?? '—'}</td>
          <td class="max-w-[28rem] px-3 py-2 text-neutral-700">{truncate(p.first_comment, 80)}</td>
          <td class="px-3 py-2 text-neutral-700">{Math.max(0, p.comment_count - 1)}</td>
          <td class="px-3 py-2">
            {#if p.resolved_at}
              <span class="text-emerald-700" aria-label="resolved">✓</span>
            {:else}
              <span class="text-neutral-400" aria-label="open">—</span>
            {/if}
          </td>
          <td class="px-3 py-2 text-neutral-500" title={p.created_at}>{relTime(p.created_at)}</td>
        </tr>
      {/each}
      {#if sorted.length === 0}
        <tr>
          <td colspan="7" class="px-3 py-6 text-center text-xs italic text-neutral-500">
            No pins match the current filters.
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>
