import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pin/comment delete + restore tests for PinStore.
 *
 * Stubs the supabase singleton with a `from('pins'|'comments').delete().eq()`
 * chain that resolves to a configurable { error, count } pair. Asserts the
 * optimistic remove + RLS-aware rollback semantics described in the store.
 */

const pinDeleteEq = vi.fn();
const pinInsertCall = vi.fn();
const commentDeleteEq = vi.fn();
const commentInsertCall = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'pins') {
          return {
            delete: vi.fn(() => ({ eq: pinDeleteEq })),
            insert: pinInsertCall
          };
        }
        if (table === 'comments') {
          return {
            delete: vi.fn(() => ({ eq: commentDeleteEq })),
            insert: commentInsertCall
          };
        }
        return {};
      })
    }
  };
});

import { createPinStore, type Pin, type Thread } from '../../src/lib/pin-store.svelte';
import type { VariantSlug } from '../../src/lib/variants';

function makePin(overrides: Partial<Pin> = {}): Pin {
  return {
    id: 'pin-1',
    variant: 'recommended' as VariantSlug,
    page_index: 0,
    x_pct: 50,
    y_pct: 50,
    reviewer_id: 'me',
    resolved_at: null,
    created_at: '2026-04-26T00:00:00Z',
    ...overrides
  };
}

describe('PinStore.deletePin / restorePin', () => {
  beforeEach(() => {
    pinDeleteEq.mockReset();
    pinInsertCall.mockReset();
  });

  it('optimistically removes the pin and resolves with the snapshot', async () => {
    const store = createPinStore();
    const pin = makePin();
    store.__setPinsForTests([pin]);

    pinDeleteEq.mockResolvedValueOnce({ error: null, count: 1 });

    const snap = await store.deletePin('pin-1');
    expect(snap).toEqual(expect.objectContaining({ id: 'pin-1' }));
    expect(store.pins).toHaveLength(0);
  });

  it('rolls back when RLS rejects (count = 0, no error)', async () => {
    const store = createPinStore();
    const pin = makePin();
    store.__setPinsForTests([pin]);

    pinDeleteEq.mockResolvedValueOnce({ error: null, count: 0 });

    await expect(store.deletePin('pin-1')).rejects.toThrow(/not author/i);
    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id).toBe('pin-1');
  });

  it('rolls back when transport errors', async () => {
    const store = createPinStore();
    const pin = makePin();
    store.__setPinsForTests([pin]);

    pinDeleteEq.mockResolvedValueOnce({ error: { message: 'network down' }, count: null });

    await expect(store.deletePin('pin-1')).rejects.toThrow(/network down/);
    expect(store.pins).toHaveLength(1);
  });

  it('closes the active thread when the deleted pin is open', async () => {
    const store = createPinStore();
    const pin = makePin();
    store.__setPinsForTests([pin]);
    store.__setActiveThreadForTests({ pin, comments: [] });

    pinDeleteEq.mockResolvedValueOnce({ error: null, count: 1 });
    await store.deletePin('pin-1');
    expect(store.activeThread).toBeNull();
  });

  it('restorePin re-inserts and re-adds to the local list', async () => {
    const store = createPinStore();
    const pin = makePin();
    pinInsertCall.mockResolvedValueOnce({ error: null });

    await store.restorePin(pin);
    expect(pinInsertCall).toHaveBeenCalledTimes(1);
    expect(store.pins.find((p) => p.id === pin.id)).toBeTruthy();
  });

  it('restorePin surfaces insert errors', async () => {
    const store = createPinStore();
    const pin = makePin();
    pinInsertCall.mockResolvedValueOnce({ error: { message: 'fk violation' } });

    await expect(store.restorePin(pin)).rejects.toThrow(/fk violation/);
  });
});

describe('PinStore.deleteComment / restoreComment', () => {
  beforeEach(() => {
    commentDeleteEq.mockReset();
    commentInsertCall.mockReset();
  });

  function seedThread(): Thread {
    return {
      pin: makePin(),
      comments: [
        {
          id: 'c1',
          pin_id: 'pin-1',
          reviewer_id: 'me',
          body: 'mine',
          created_at: '2026-04-26T00:00:00Z'
        },
        {
          id: 'c2',
          pin_id: 'pin-1',
          reviewer_id: 'other',
          body: 'theirs',
          created_at: '2026-04-26T00:01:00Z'
        }
      ]
    };
  }

  it('removes a comment optimistically and returns it', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(seedThread());
    commentDeleteEq.mockResolvedValueOnce({ error: null, count: 1 });

    const snap = await store.deleteComment('c1');
    expect(snap?.id).toBe('c1');
    expect(store.activeThread?.comments.map((c) => c.id)).toEqual(['c2']);
  });

  it('rolls back on RLS rejection', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(seedThread());
    commentDeleteEq.mockResolvedValueOnce({ error: null, count: 0 });

    await expect(store.deleteComment('c1')).rejects.toThrow(/not author/i);
    expect(store.activeThread?.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('returns null when there is no active thread', async () => {
    const store = createPinStore();
    const snap = await store.deleteComment('nope');
    expect(snap).toBeNull();
    expect(commentDeleteEq).not.toHaveBeenCalled();
  });

  it('restoreComment re-inserts and re-adds to the active thread', async () => {
    const store = createPinStore();
    const thread = seedThread();
    store.__setActiveThreadForTests({
      ...thread,
      comments: [thread.comments[1]] // c2 only
    });
    commentInsertCall.mockResolvedValueOnce({ error: null });

    await store.restoreComment(thread.comments[0]);
    expect(commentInsertCall).toHaveBeenCalledTimes(1);
    expect(store.activeThread?.comments.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('applyRealtimeCommentDelete removes from the active thread', () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(seedThread());
    store.applyRealtimeCommentDelete('c2');
    expect(store.activeThread?.comments.map((c) => c.id)).toEqual(['c1']);
  });
});
