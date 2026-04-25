import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock builders. The store calls:
//   from('variant_picks').select(...).eq(...).order(...)         [load]
//   from('variant_picks').delete().eq(...)                       [submit step 1]
//   from('variant_picks').insert(rows)                           [submit step 2]
const selectOrder = vi.fn();
const deleteEq = vi.fn();
const insertCall = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table !== 'variant_picks') return {};
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: selectOrder
            }))
          })),
          delete: vi.fn(() => ({ eq: deleteEq })),
          insert: insertCall
        };
      })
    }
  };
});

import { createPickStore } from '../../src/lib/pick-store.svelte';
import { VARIANTS } from '../../src/lib/variants';

const REVIEWER_ID = 'rev-pick-1';

describe('pick-store', () => {
  beforeEach(() => {
    selectOrder.mockReset();
    deleteEq.mockReset();
    insertCall.mockReset();
  });

  it('initialises ranking to the catalog order', () => {
    const store = createPickStore();
    expect(store.ranking).toEqual(VARIANTS.map((v) => v.slug));
    expect(store.notes).toBe('');
    expect(store.submitted).toBe(false);
  });

  it('reorder moves an item from one index to another', () => {
    const store = createPickStore();
    const slugs = VARIANTS.map((v) => v.slug);
    // Move index 4 → 0 (huashu to top).
    store.reorder(4, 0);
    const expected = [slugs[4], slugs[0], slugs[1], slugs[2], slugs[3], slugs[5]];
    expect(store.ranking).toEqual(expected);
  });

  it('promoteToTop moves the chosen slug to rank 1', () => {
    const store = createPickStore();
    store.promoteToTop('baseline');
    expect(store.ranking[0]).toBe('baseline');
    // Length preserved.
    expect(store.ranking).toHaveLength(VARIANTS.length);
  });

  it('reorder is a no-op when from === to or out of bounds', () => {
    const store = createPickStore();
    const before = [...store.ranking];
    store.reorder(2, 2);
    store.reorder(-1, 3);
    store.reorder(0, 99);
    expect(store.ranking).toEqual(before);
  });

  it('loadExisting hydrates ranking + notes when prior rows exist', async () => {
    selectOrder.mockResolvedValueOnce({
      data: [
        { reviewer_id: REVIEWER_ID, variant: 'impeccable', ranking: 1, notes: 'love it' },
        { reviewer_id: REVIEWER_ID, variant: 'baseline', ranking: 2, notes: null },
        { reviewer_id: REVIEWER_ID, variant: 'huashu', ranking: 3, notes: null },
        { reviewer_id: REVIEWER_ID, variant: 'recommended', ranking: 4, notes: null },
        { reviewer_id: REVIEWER_ID, variant: 'taste-frontend', ranking: 5, notes: null },
        { reviewer_id: REVIEWER_ID, variant: 'faithful', ranking: 6, notes: null }
      ],
      error: null
    });

    const store = createPickStore();
    await store.loadExisting(REVIEWER_ID);

    expect(store.ranking[0]).toBe('impeccable');
    expect(store.ranking[1]).toBe('baseline');
    expect(store.notes).toBe('love it');
    expect(store.submitted).toBe(true);
  });

  it('loadExisting leaves defaults when no prior rows', async () => {
    selectOrder.mockResolvedValueOnce({ data: [], error: null });

    const store = createPickStore();
    const before = [...store.ranking];
    await store.loadExisting(REVIEWER_ID);

    expect(store.ranking).toEqual(before);
    expect(store.submitted).toBe(false);
  });

  it('submit deletes prior rows then inserts six fresh rows in rank order', async () => {
    deleteEq.mockResolvedValueOnce({ error: null });
    insertCall.mockResolvedValueOnce({ error: null });

    const store = createPickStore();
    store.notes = '  these are my thoughts  ';
    // Custom order: huashu first.
    store.promoteToTop('huashu');

    await store.submit(REVIEWER_ID);

    expect(deleteEq).toHaveBeenCalledTimes(1);
    expect(insertCall).toHaveBeenCalledTimes(1);
    const rows = insertCall.mock.calls[0][0] as Array<{
      reviewer_id: string;
      variant: string;
      ranking: number;
      notes: string | null;
    }>;
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      reviewer_id: REVIEWER_ID,
      variant: 'huashu',
      ranking: 1,
      notes: 'these are my thoughts'
    });
    // Only rank-1 row carries notes.
    rows.slice(1).forEach((r) => {
      expect(r.notes).toBeNull();
      expect(r.ranking).toBeGreaterThan(1);
    });
    expect(store.submitted).toBe(true);
    expect(store.submitError).toBeNull();
  });

  it('submit surfaces error on insert failure', async () => {
    deleteEq.mockResolvedValueOnce({ error: null });
    insertCall.mockResolvedValueOnce({ error: { message: 'rls denied' } });

    const store = createPickStore();
    await expect(store.submit(REVIEWER_ID)).rejects.toThrow(/rls denied/);
    expect(store.submitError).toMatch(/rls denied/);
    expect(store.submitted).toBe(false);
  });

  it('submit surfaces error on delete failure (without calling insert)', async () => {
    deleteEq.mockResolvedValueOnce({ error: { message: 'cannot delete' } });

    const store = createPickStore();
    await expect(store.submit(REVIEWER_ID)).rejects.toThrow(/cannot delete/);
    expect(insertCall).not.toHaveBeenCalled();
    expect(store.submitError).toMatch(/cannot delete/);
  });
});
