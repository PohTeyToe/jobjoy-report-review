<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { PinStore } from './pin-store.svelte';
  import type { Identity } from './identity';
  import { subscribeCommentsForThread, type CommentRow } from './realtime';

  type Props = {
    pinId: string | null;
    store: PinStore;
    identity: Identity | null;
    onclose: () => void;
  };

  const { pinId, store, identity, onclose }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let replyBody = $state('');
  let posting = $state(false);
  let resolving = $state(false);
  let loadError = $state<string | null>(null);
  let unsubscribe: (() => void) | null = null;

  // Pin-id-driven loading. When pinId changes (open a different thread, or
  // close → null), tear down the previous subscription and reload.
  $effect(() => {
    const id = pinId;
    // Always tear down previous subscription before reacting.
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (!id) {
      store.clearThread();
      return;
    }
    loadError = null;
    void (async () => {
      const thread = await store.loadThread(id);
      if (!thread) {
        loadError = 'Could not load this thread.';
        return;
      }
      // Focus the reply box once the panel content is mounted.
      await tick();
      textareaEl?.focus();
      // Subscribe AFTER initial load so the first batch isn't double-applied.
      unsubscribe = subscribeCommentsForThread(id, (ev) => {
        if (ev.type !== 'INSERT') return;
        const row = ev.new as CommentRow;
        store.applyRealtimeComment({
          id: row.id,
          pin_id: row.pin_id,
          reviewer_id: row.reviewer_id,
          body: row.body,
          created_at: row.created_at
        });
      });
    })();
  });

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab') return;
    // Trap Tab inside the panel.
    const root = containerEl;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });
  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  });

  async function postReply(): Promise<void> {
    if (!pinId || !identity) return;
    const body = replyBody.trim();
    if (!body || posting) return;
    posting = true;
    try {
      await store.addComment(pinId, body, identity);
      replyBody = '';
      textareaEl?.focus();
    } catch (err) {
      console.error('[ThreadPanel] addComment failed:', err);
      loadError = err instanceof Error ? err.message : 'Failed to post.';
    } finally {
      posting = false;
    }
  }

  async function toggleResolve(): Promise<void> {
    if (!pinId || resolving) return;
    resolving = true;
    try {
      await store.toggleResolved(pinId);
    } catch (err) {
      console.error('[ThreadPanel] toggleResolved failed:', err);
      loadError = err instanceof Error ? err.message : 'Failed to update.';
    } finally {
      resolving = false;
    }
  }

  function onReplyKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void postReply();
    }
  }

  function fmt(ts: string): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  // Pin number on its page = (1-based index of this pin among same-page,
  // same-variant pins). Computed from store.pins which is already ordered
  // by created_at asc.
  function pinNumber(): number {
    const t = store.activeThread;
    if (!t) return 0;
    const samePage = store.pins.filter(
      (p) => p.page_index === t.pin.page_index && p.variant === t.pin.variant
    );
    const idx = samePage.findIndex((p) => p.id === t.pin.id);
    return idx >= 0 ? idx + 1 : 1;
  }
</script>

{#if pinId}
  <div
    bind:this={containerEl}
    data-testid="thread-panel"
    role="dialog"
    aria-modal="false"
    aria-label="Pin thread"
    class="fixed right-0 top-0 z-40 flex h-screen w-[400px] max-w-full flex-col border-l border-neutral-200 bg-white shadow-2xl transition-transform"
  >
    <!-- Header -->
    <div class="flex items-start justify-between border-b border-neutral-200 px-4 py-3">
      <div>
        <div class="text-xs font-medium uppercase tracking-wide text-neutral-500">Thread</div>
        {#if store.activeThread}
          <div class="mt-0.5 text-sm font-semibold text-neutral-900" data-testid="thread-title">
            Pin #{pinNumber()} on page {store.activeThread.pin.page_index + 1}
          </div>
        {/if}
      </div>
      <button
        type="button"
        data-testid="thread-close"
        aria-label="Close thread"
        onclick={() => onclose()}
        class="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>

    {#if loadError}
      <div role="alert" class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
        {loadError}
      </div>
    {/if}

    <!-- Metadata -->
    {#if store.activeThread}
      <div class="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-600">
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <span data-testid="thread-variant"
            >Variant: <span class="font-medium text-neutral-800"
              >{store.activeThread.pin.variant}</span
            ></span
          >
          <span
            >By <span class="font-medium text-neutral-800"
              >{store.activeThread.pin.reviewer_name ?? '—'}</span
            ></span
          >
          <span>{fmt(store.activeThread.pin.created_at)}</span>
        </div>
        <div class="mt-1">
          {#if store.activeThread.pin.resolved_at}
            <span
              data-testid="thread-resolved-badge"
              class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
            >
              Resolved
            </span>
          {:else}
            <span
              class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
            >
              Open
            </span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Comments -->
    <div class="flex-1 overflow-y-auto px-4 py-3" data-testid="thread-comments">
      {#if store.activeThread}
        {#each store.activeThread.comments as c (c.id)}
          <div class="mb-3" data-testid="thread-comment" data-comment-id={c.id}>
            <div class="flex items-baseline gap-2 text-xs">
              <span class="font-semibold text-neutral-900">{c.reviewer_name ?? '—'}</span>
              <span class="text-neutral-500">{fmt(c.created_at)}</span>
              {#if c.isOptimistic}
                <span class="text-neutral-400">(sending…)</span>
              {/if}
            </div>
            <div class="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{c.body}</div>
          </div>
        {/each}
        {#if store.activeThread.comments.length === 0}
          <div class="text-xs italic text-neutral-500">No comments yet.</div>
        {/if}
      {:else if !loadError}
        <div class="text-xs italic text-neutral-500">Loading…</div>
      {/if}
    </div>

    <!-- Composer + resolve -->
    <div class="border-t border-neutral-200 px-4 py-3">
      {#if identity}
        <textarea
          bind:this={textareaEl}
          bind:value={replyBody}
          onkeydown={onReplyKeydown}
          rows="3"
          placeholder="Write a reply… (Enter to send, Shift+Enter for newline)"
          aria-label="Reply body"
          data-testid="thread-reply-input"
          class="w-full resize-none rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20"
        ></textarea>
        <div class="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="thread-resolve-toggle"
            onclick={toggleResolve}
            disabled={resolving}
            class="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
          >
            {#if store.activeThread?.pin.resolved_at}
              Reopen thread
            {:else}
              Resolve thread
            {/if}
          </button>
          <button
            type="button"
            data-testid="thread-reply-submit"
            onclick={postReply}
            disabled={!replyBody.trim() || posting}
            class="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      {:else}
        <div class="text-xs italic text-neutral-500">Sign in to reply.</div>
      {/if}
    </div>
  </div>
{/if}
