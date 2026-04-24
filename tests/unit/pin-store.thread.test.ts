import { describe, it, expect, vi, beforeEach } from 'vitest';

const pinSelectSingle = vi.fn();
const commentInsertSingle = vi.fn();
const pinUpdateEq = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'pins') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ single: pinSelectSingle }))
              }))
            })),
            update: vi.fn(() => ({ eq: pinUpdateEq }))
          };
        }
        if (table === 'comments') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({ single: commentInsertSingle }))
            }))
          };
        }
        return {};
      })
    }
  };
});

import { createPinStore, type Pin } from '../../src/lib/pin-store.svelte';
import type { VariantSlug } from '../../src/lib/variants';

const reviewer = { id: 'rev-1', name: 'Alice' };

function basePin(overrides: Partial<Pin> = {}): Pin {
  return {
    id: 'pin-1',
    variant: 'recommended' as VariantSlug,
    page_index: 0,
    x_pct: 10,
    y_pct: 20,
    reviewer_id: 'rev-1',
    reviewer_name: 'Alice',
    resolved_at: null,
    created_at: '2026-04-24T00:00:00Z',
    ...overrides
  };
}

describe('pin-store thread/resolve', () => {
  beforeEach(() => {
    pinSelectSingle.mockReset();
    commentInsertSingle.mockReset();
    pinUpdateEq.mockReset();
  });

  it('loadThread returns pin + comments (server-ordered) + reviewer names', async () => {
    pinSelectSingle.mockResolvedValueOnce({
      data: {
        id: 'pin-1',
        variant: 'recommended',
        page_index: 0,
        x_pct: 10,
        y_pct: 20,
        reviewer_id: 'rev-1',
        resolved_at: null,
        created_at: '2026-04-24T00:00:00Z',
        reviewers: { name: 'Alice' },
        comments: [
          {
            id: 'c1',
            pin_id: 'pin-1',
            reviewer_id: 'rev-1',
            body: 'first',
            created_at: '2026-04-24T00:30:00Z',
            reviewers: { name: 'Alice' }
          },
          {
            id: 'c2',
            pin_id: 'pin-1',
            reviewer_id: 'rev-2',
            body: 'second',
            created_at: '2026-04-24T01:00:00Z',
            reviewers: { name: 'Bob' }
          }
        ]
      },
      error: null
    });

    const store = createPinStore();
    const thread = await store.loadThread('pin-1');
    expect(thread).not.toBeNull();
    expect(thread!.pin.id).toBe('pin-1');
    expect(thread!.pin.reviewer_name).toBe('Alice');
    expect(thread!.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(thread!.comments[1].reviewer_name).toBe('Bob');
    expect(store.activeThread?.comments).toHaveLength(2);
  });

  it('addComment optimistically appends, then swaps to real id', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests({
      pin: basePin(),
      comments: []
    });

    commentInsertSingle.mockResolvedValueOnce({
      data: {
        id: 'real-c',
        pin_id: 'pin-1',
        reviewer_id: 'rev-1',
        body: 'hello',
        created_at: '2026-04-24T02:00:00Z'
      },
      error: null
    });

    const promise = store.addComment('pin-1', 'hello', reviewer);
    // Microtask flush
    await Promise.resolve();
    expect(store.activeThread?.comments).toHaveLength(1);
    expect(store.activeThread?.comments[0].isOptimistic).toBe(true);
    await promise;
    expect(store.activeThread?.comments).toHaveLength(1);
    expect(store.activeThread?.comments[0].id).toBe('real-c');
    expect(store.activeThread?.comments[0].isOptimistic).toBe(false);
  });

  it('addComment rolls back on insert failure', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests({ pin: basePin(), comments: [] });
    commentInsertSingle.mockResolvedValueOnce({ data: null, error: { message: 'rls' } });
    await expect(store.addComment('pin-1', 'hi', reviewer)).rejects.toThrow(/rls/);
    expect(store.activeThread?.comments).toHaveLength(0);
  });

  it('toggleResolved flips resolved_at and reflects in pins + active thread', async () => {
    const store = createPinStore();
    store.__setPinsForTests([basePin()]);
    store.__setActiveThreadForTests({ pin: basePin(), comments: [] });
    pinUpdateEq.mockResolvedValueOnce({ error: null });

    await store.toggleResolved('pin-1');
    expect(store.pins[0].resolved_at).not.toBeNull();
    expect(store.activeThread?.pin.resolved_at).not.toBeNull();

    pinUpdateEq.mockResolvedValueOnce({ error: null });
    await store.toggleResolved('pin-1');
    expect(store.pins[0].resolved_at).toBeNull();
    expect(store.activeThread?.pin.resolved_at).toBeNull();
  });

  it('toggleResolved rolls back on error', async () => {
    const store = createPinStore();
    store.__setPinsForTests([basePin()]);
    pinUpdateEq.mockResolvedValueOnce({ error: { message: 'denied' } });
    await expect(store.toggleResolved('pin-1')).rejects.toThrow(/denied/);
    expect(store.pins[0].resolved_at).toBeNull();
  });

  it('applyRealtimePin INSERT skips duplicates (echo of own optimistic write)', () => {
    const store = createPinStore();
    store.__setActiveVariantForTests('recommended');
    store.__setPinsForTests([basePin()]);
    store.applyRealtimePin('INSERT', basePin());
    expect(store.pins).toHaveLength(1);
  });

  it('applyRealtimePin INSERT appends a new pin from another reviewer', () => {
    const store = createPinStore();
    store.__setActiveVariantForTests('recommended');
    store.__setPinsForTests([basePin()]);
    store.applyRealtimePin('INSERT', basePin({ id: 'pin-2', x_pct: 50 }));
    expect(store.pins).toHaveLength(2);
    expect(store.pins[1].id).toBe('pin-2');
  });

  it('applyRealtimePin UPDATE merges resolved_at into existing pin', () => {
    const store = createPinStore();
    store.__setPinsForTests([basePin()]);
    store.applyRealtimePin('UPDATE', { id: 'pin-1', resolved_at: '2026-04-24T05:00:00Z' });
    expect(store.pins[0].resolved_at).toBe('2026-04-24T05:00:00Z');
  });

  it('applyRealtimeComment dedupes by id', () => {
    const store = createPinStore();
    store.__setActiveThreadForTests({
      pin: basePin(),
      comments: [
        {
          id: 'c1',
          pin_id: 'pin-1',
          reviewer_id: 'rev-1',
          body: 'hi',
          created_at: '2026-04-24T00:00:00Z'
        }
      ]
    });
    store.applyRealtimeComment({
      id: 'c1',
      pin_id: 'pin-1',
      reviewer_id: 'rev-1',
      body: 'hi',
      created_at: '2026-04-24T00:00:00Z'
    });
    expect(store.activeThread?.comments).toHaveLength(1);
    store.applyRealtimeComment({
      id: 'c2',
      pin_id: 'pin-1',
      reviewer_id: 'rev-2',
      body: 'second',
      created_at: '2026-04-24T01:00:00Z'
    });
    expect(store.activeThread?.comments).toHaveLength(2);
  });
});
