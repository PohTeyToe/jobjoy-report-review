import { describe, it, expect, vi, beforeEach } from 'vitest';

const pinsThenable = vi.fn();
const picksThenable = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'pins') {
          return {
            select: vi.fn(() => ({
              order: () =>
                ({
                  then: (resolve: (v: unknown) => void) =>
                    Promise.resolve(pinsThenable()).then(resolve)
                }) as unknown
            }))
          };
        }
        if (table === 'variant_picks') {
          return {
            select: vi.fn(() => ({
              order: () =>
                ({
                  then: (resolve: (v: unknown) => void) =>
                    Promise.resolve(picksThenable()).then(resolve)
                }) as unknown
            }))
          };
        }
        return {};
      })
    }
  };
});

import {
  createAdminStore,
  applyFilters,
  defaultFilters,
  type AdminPin
} from '../../src/lib/admin/admin-store.svelte';

const samplePins: AdminPin[] = [
  {
    id: 'p1',
    variant: 'recommended',
    page_index: 0,
    x_pct: 10,
    y_pct: 20,
    reviewer_id: 'rev-1',
    reviewer_name: 'Alice',
    first_comment: 'open one',
    comment_count: 1,
    resolved_at: null,
    created_at: '2026-04-20T10:00:00Z'
  },
  {
    id: 'p2',
    variant: 'huashu',
    page_index: 1,
    x_pct: 30,
    y_pct: 40,
    reviewer_id: 'rev-2',
    reviewer_name: 'Bob',
    first_comment: 'resolved one',
    comment_count: 2,
    resolved_at: '2026-04-22T10:00:00Z',
    created_at: '2026-04-21T10:00:00Z'
  }
];

describe('admin-store applyFilters', () => {
  it('returns all pins by default', () => {
    expect(applyFilters(samplePins, defaultFilters())).toHaveLength(2);
  });

  it('filters by variant', () => {
    const out = applyFilters(samplePins, { ...defaultFilters(), variants: ['recommended'] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p1');
  });

  it('filters by reviewer', () => {
    const out = applyFilters(samplePins, { ...defaultFilters(), reviewerIds: ['rev-2'] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p2');
  });

  it('filters by resolved state', () => {
    expect(
      applyFilters(samplePins, { ...defaultFilters(), resolved: 'open' }).map((p) => p.id)
    ).toEqual(['p1']);
    expect(
      applyFilters(samplePins, { ...defaultFilters(), resolved: 'resolved' }).map((p) => p.id)
    ).toEqual(['p2']);
  });

  it('filters by date range', () => {
    const out = applyFilters(samplePins, {
      ...defaultFilters(),
      dateFrom: '2026-04-21T00:00:00Z'
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p2');
  });

  it('dateTo includes pins created later in the same day', () => {
    const today = '2026-04-24';
    const todayPin: AdminPin = {
      id: 'p-today',
      variant: 'recommended',
      page_index: 0,
      x_pct: 0,
      y_pct: 0,
      reviewer_id: 'rev-1',
      reviewer_name: 'Alice',
      first_comment: 'today',
      comment_count: 1,
      resolved_at: null,
      // Full ISO timestamp later in the same day (afternoon UTC).
      created_at: '2026-04-24T15:42:11.123Z'
    };
    const out = applyFilters([todayPin], { ...defaultFilters(), dateTo: today });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('p-today');
  });
});

describe('admin-store loadAll', () => {
  beforeEach(() => {
    pinsThenable.mockReset();
    picksThenable.mockReset();
  });

  it('shapes pin rows into AdminPin with comment_count and first_comment', async () => {
    pinsThenable.mockReturnValue({
      data: [
        {
          id: 'p1',
          variant: 'recommended',
          page_index: 0,
          x_pct: 10,
          y_pct: 20,
          reviewer_id: 'rev-1',
          resolved_at: null,
          created_at: '2026-04-20T10:00:00Z',
          reviewers: { name: 'Alice' },
          comments: [
            {
              id: 'c2',
              body: 'reply',
              created_at: '2026-04-20T11:00:00Z',
              reviewer_id: 'rev-2',
              reviewers: { name: 'Bob' }
            },
            {
              id: 'c1',
              body: 'first',
              created_at: '2026-04-20T10:00:00Z',
              reviewer_id: 'rev-1',
              reviewers: { name: 'Alice' }
            }
          ]
        }
      ],
      error: null
    });
    picksThenable.mockReturnValue({
      data: [
        {
          id: 'pk1',
          reviewer_id: 'rev-1',
          variant: 'recommended',
          ranking: 1,
          notes: 'best',
          created_at: '2026-04-22T00:00:00Z',
          reviewers: { name: 'Alice' }
        }
      ],
      error: null
    });

    const store = createAdminStore();
    await store.loadAll();
    expect(store.allPins).toHaveLength(1);
    expect(store.allPins[0].first_comment).toBe('first');
    expect(store.allPins[0].comment_count).toBe(2);
    expect(store.allPins[0].reviewer_name).toBe('Alice');
    expect(store.allComments['p1']).toHaveLength(2);
    expect(store.allComments['p1'][0].body).toBe('first'); // sorted asc
    expect(store.allPicks).toHaveLength(1);
    expect(store.allPicks[0].reviewer_name).toBe('Alice');
  });
});
