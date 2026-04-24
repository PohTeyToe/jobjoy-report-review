<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { PUBLIC_ADMIN_SECRET } from '$env/static/public';
  import { error } from '@sveltejs/kit';
  import {
    createAdminStore,
    defaultFilters,
    applyFilters,
    type AdminFilters,
    type AdminPin
  } from '$lib/admin/admin-store.svelte';
  import { getIdentity, type Identity } from '$lib/identity';
  import { createPinStore, type Pin } from '$lib/pin-store.svelte';
  import ThreadPanel from '$lib/ThreadPanel.svelte';
  import PinFilters from '$lib/admin/PinFilters.svelte';
  import PinsTable from '$lib/admin/PinsTable.svelte';
  import PicksPanel from '$lib/admin/PicksPanel.svelte';
  import ExportButton from '$lib/admin/ExportButton.svelte';

  if (page.params.secret !== PUBLIC_ADMIN_SECRET) {
    error(404, 'Not found');
  }

  const adminStore = createAdminStore();
  const threadStore = createPinStore();

  let filters = $state<AdminFilters>(defaultFilters());
  let openPinId = $state<string | null>(null);
  let identity = $state<Identity | null>(null);

  const filteredPins = $derived(applyFilters(adminStore.allPins, filters));

  const reviewers = $derived.by(() => {
    const map = new Map<string, string>();
    for (const p of adminStore.allPins) {
      if (p.reviewer_name) map.set(p.reviewer_id, p.reviewer_name);
    }
    for (const p of adminStore.allPicks) {
      if (p.reviewer_name) map.set(p.reviewer_id, p.reviewer_name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  function setFilters(next: AdminFilters): void {
    filters = next;
  }

  function setUrl(next: { variant?: string | null; pageIdx?: number | null; pin?: string | null }) {
    const url = new URL(page.url);
    if (next.variant !== undefined) {
      if (next.variant) url.searchParams.set('variant', next.variant);
      else url.searchParams.delete('variant');
    }
    if (next.pageIdx !== undefined) {
      if (next.pageIdx !== null) url.searchParams.set('page', String(next.pageIdx));
      else url.searchParams.delete('page');
    }
    if (next.pin !== undefined) {
      if (next.pin) url.searchParams.set('pin', next.pin);
      else url.searchParams.delete('pin');
    }
    void goto(`${url.pathname}${url.search}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }

  function openPin(pin: AdminPin): void {
    openPinId = pin.id;
    setUrl({ variant: pin.variant, pageIdx: pin.page_index, pin: pin.id });
  }

  function closeThread(): void {
    openPinId = null;
    setUrl({ pin: null });
  }

  onMount(() => {
    identity = getIdentity();
    void adminStore.loadAll();
    adminStore.subscribeRealtime();

    const linked = page.url.searchParams.get('pin');
    if (linked) openPinId = linked;
  });

  // Seed threadStore.pins with the full admin pin list so ThreadPanel's
  // pinNumber() returns the correct 1-based position across all variants/pages.
  $effect(() => {
    threadStore.pins = adminStore.allPins as Pin[];
  });

  onDestroy(() => {
    adminStore.unsubscribeRealtime();
  });
</script>

<svelte:head>
  <title>Admin — JobJoy Report Review</title>
</svelte:head>

<main class="min-h-screen bg-neutral-50" data-testid="admin-dashboard">
  <header
    class="sticky top-0 z-10 flex items-center gap-4 border-b border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur"
  >
    <a href="/" class="text-sm text-neutral-500 hover:text-neutral-900">← Home</a>
    <h1 class="text-lg font-semibold text-neutral-900">Admin dashboard</h1>
    <div class="ml-auto flex items-center gap-3">
      <span class="text-xs text-neutral-500" data-testid="admin-pin-count"
        >{filteredPins.length} pin{filteredPins.length === 1 ? '' : 's'}</span
      >
      <ExportButton
        pins={adminStore.allPins}
        picks={adminStore.allPicks}
        comments={adminStore.allComments}
      />
    </div>
  </header>

  {#if adminStore.loadError}
    <div role="alert" class="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700">
      {adminStore.loadError}
    </div>
  {/if}

  <div class="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[280px_1fr]">
    <PinFilters {filters} {reviewers} onchange={setFilters} />

    <div class="space-y-6">
      {#if adminStore.loading && adminStore.allPins.length === 0}
        <div class="rounded-md border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Loading…
        </div>
      {:else}
        <PinsTable pins={filteredPins} onopen={openPin} />
      {/if}
      <PicksPanel picks={adminStore.allPicks} />
    </div>
  </div>

  <ThreadPanel pinId={openPinId} store={threadStore} {identity} onclose={closeThread} />
</main>
