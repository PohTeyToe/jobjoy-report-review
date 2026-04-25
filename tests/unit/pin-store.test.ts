import { describe, it, expect, vi, beforeEach } from 'vitest';

type Resolver<T> = (value: T) => void;
function deferred<T>(): {
  promise: Promise<T>;
  resolve: Resolver<T>;
  reject: (e: unknown) => void;
} {
  let resolve!: Resolver<T>;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const pinInsertSingle = vi.fn();
const commentInsert = vi.fn();
const pinSelect = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'pins') {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({ single: pinInsertSingle }))
            })),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                // First .order('created_at', { ascending: true }) returns a
                // builder whose .order(...) is the awaitable thenable. The
                // store chains a second .order to scope comments asc.
                order: vi.fn(() => ({
                  order: pinSelect
                }))
              }))
            })),
            delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
          };
        }
        if (table === 'comments') {
          return { insert: commentInsert };
        }
        return {};
      })
    }
  };
});

import { createPinStore } from '../../src/lib/pin-store.svelte';
import type { VariantSlug } from '../../src/lib/variants';

const baseInput = {
  variant: 'recommended' as VariantSlug,
  page_index: 0,
  x_pct: 50,
  y_pct: 50,
  body: 'looks off',
  reviewer: { id: 'rev-1', name: 'Test' }
};

describe('pin-store', () => {
  beforeEach(() => {
    pinInsertSingle.mockReset();
    commentInsert.mockReset();
    pinSelect.mockReset();
  });

  it('appends a temp pin synchronously, then replaces with real id on resolve', async () => {
    const pinDef = deferred<{ data: unknown; error: unknown }>();
    pinInsertSingle.mockImplementationOnce(() => pinDef.promise);
    commentInsert.mockResolvedValueOnce({ data: null, error: null });

    const store = createPinStore();
    const dropPromise = store.dropPin(baseInput);

    // Microtask flush for the first await tick to assign the temp pin.
    await Promise.resolve();
    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id.startsWith('temp-')).toBe(true);
    expect(store.pins[0].isOptimistic).toBe(true);

    pinDef.resolve({
      data: { id: 'real-uuid-1', created_at: '2026-04-24T00:00:00Z' },
      error: null
    });
    await dropPromise;

    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id).toBe('real-uuid-1');
    expect(store.pins[0].isOptimistic).toBe(false);
    expect(commentInsert).toHaveBeenCalledTimes(1);
  });

  it('rolls back the optimistic pin on insert failure and records the error', async () => {
    pinInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'rls' }
    });

    const store = createPinStore();
    await expect(store.dropPin(baseInput)).rejects.toThrow(/rls/);

    expect(store.pins).toHaveLength(0);
    expect(store.failed).toHaveLength(1);
    expect(store.failed[0].error).toMatch(/rls/);
  });

  it("rolls back when comment insert fails (so we don't leave orphan UI)", async () => {
    pinInsertSingle.mockResolvedValueOnce({
      data: { id: 'real-2', created_at: '2026-04-24T00:00:00Z' },
      error: null
    });
    commentInsert.mockResolvedValueOnce({
      data: null,
      error: { message: 'comment rls' }
    });

    const store = createPinStore();
    await expect(store.dropPin(baseInput)).rejects.toThrow(/comment rls/);
    expect(store.pins).toHaveLength(0);
    expect(store.failed).toHaveLength(1);
  });

  it('applyRealtimePin INSERT replaces matching optimistic temp row in place', async () => {
    // Simulate dropPin's optimistic step: a temp row exists locally.
    const pinDef = deferred<{ data: unknown; error: unknown }>();
    pinInsertSingle.mockImplementationOnce(() => pinDef.promise);
    commentInsert.mockResolvedValueOnce({ data: null, error: null });

    const store = createPinStore();
    store.__setActiveVariantForTests('recommended');
    const dropPromise = store.dropPin(baseInput);
    await Promise.resolve();
    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id.startsWith('temp-')).toBe(true);

    // Realtime echoes the canonical row BEFORE dropPin's INSERT response
    // resolves. Without dedup, this would push a second row with a different
    // id and crash the keyed {#each} (each_key_duplicate).
    store.applyRealtimePin('INSERT', {
      id: 'real-uuid-rt',
      variant: 'recommended',
      page_index: baseInput.page_index,
      x_pct: baseInput.x_pct,
      y_pct: baseInput.y_pct,
      reviewer_id: baseInput.reviewer.id,
      resolved_at: null,
      created_at: '2026-04-24T00:00:00Z'
    });

    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id).toBe('real-uuid-rt');
    expect(store.pins[0].isOptimistic).toBe(false);

    // Now resolve dropPin's INSERT response — temp swap path is a no-op
    // because the temp id no longer exists. Row stays single.
    pinDef.resolve({
      data: { id: 'real-uuid-rt', created_at: '2026-04-24T00:00:00Z' },
      error: null
    });
    await dropPromise;
    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id).toBe('real-uuid-rt');
  });

  it('applyRealtimePin INSERT for an already-present id is a no-op (no duplicate)', async () => {
    const store = createPinStore();
    store.__setActiveVariantForTests('recommended');
    store.__setPinsForTests([
      {
        id: 'real-1',
        variant: 'recommended',
        page_index: 0,
        x_pct: 50,
        y_pct: 50,
        reviewer_id: 'rev-1',
        resolved_at: null,
        created_at: '2026-04-24T00:00:00Z'
      }
    ]);

    store.applyRealtimePin('INSERT', {
      id: 'real-1',
      variant: 'recommended',
      page_index: 0,
      x_pct: 50,
      y_pct: 50,
      reviewer_id: 'rev-1',
      resolved_at: null,
      created_at: '2026-04-24T00:00:00Z'
    });

    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].id).toBe('real-1');
  });

  it('loadPins maps joined rows into the Pin shape', async () => {
    pinSelect.mockResolvedValueOnce({
      data: [
        {
          id: 'p1',
          variant: 'recommended',
          page_index: 0,
          x_pct: 10,
          y_pct: 20,
          reviewer_id: 'rev-1',
          resolved_at: null,
          created_at: '2026-04-24T00:00:00Z',
          reviewers: { name: 'Alice' },
          comments: [
            { body: 'second', created_at: '2026-04-24T01:00:00Z' },
            { body: 'first', created_at: '2026-04-24T00:30:00Z' }
          ]
        }
      ],
      error: null
    });

    const store = createPinStore();
    await store.loadPins('recommended');
    expect(store.pins).toHaveLength(1);
    expect(store.pins[0].reviewer_name).toBe('Alice');
    expect(store.pins[0].first_comment).toBe('first');
  });
});
