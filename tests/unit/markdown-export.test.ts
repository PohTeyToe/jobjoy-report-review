import { describe, it, expect } from 'vitest';
import { buildMarkdown, exportFilename } from '../../src/lib/admin/markdown-export';
import type {
  AdminPin,
  AdminPick,
  AdminThreadComment
} from '../../src/lib/admin/admin-store.svelte';

const pinA: AdminPin = {
  id: 'pin-a',
  variant: 'recommended',
  page_index: 1,
  x_pct: 25.5,
  y_pct: 40,
  reviewer_id: 'rev-1',
  reviewer_name: 'Alice',
  first_comment: 'Heading too tight',
  comment_count: 2,
  resolved_at: null,
  created_at: '2026-04-24T10:00:00Z'
};

const pinB: AdminPin = {
  id: 'pin-b',
  variant: 'huashu',
  page_index: 0,
  x_pct: 50,
  y_pct: 50,
  reviewer_id: 'rev-2',
  reviewer_name: 'Bob',
  first_comment: 'Color is loud',
  comment_count: 1,
  resolved_at: '2026-04-24T12:00:00Z',
  created_at: '2026-04-24T11:00:00Z'
};

const comments: Record<string, AdminThreadComment[]> = {
  'pin-a': [
    {
      id: 'c1',
      pin_id: 'pin-a',
      reviewer_id: 'rev-1',
      reviewer_name: 'Alice',
      body: 'Heading too tight',
      created_at: '2026-04-24T10:00:00Z'
    },
    {
      id: 'c2',
      pin_id: 'pin-a',
      reviewer_id: 'rev-2',
      reviewer_name: 'Bob',
      body: 'Agreed, +1',
      created_at: '2026-04-24T10:30:00Z'
    }
  ],
  'pin-b': [
    {
      id: 'c3',
      pin_id: 'pin-b',
      reviewer_id: 'rev-2',
      reviewer_name: 'Bob',
      body: 'Color is loud',
      created_at: '2026-04-24T11:00:00Z'
    }
  ]
};

const picks: AdminPick[] = [
  {
    reviewer_id: 'rev-1',
    reviewer_name: 'Alice',
    variant: 'recommended',
    ranking: 1,
    notes: 'Best balance',
    created_at: '2026-04-24T13:00:00Z'
  }
];

describe('markdown-export', () => {
  it('produces a deterministic feedback pack', () => {
    const md = buildMarkdown({
      pins: [pinA, pinB],
      comments,
      picks,
      exportedAt: '2026-04-24T21:30:00Z'
    });
    expect(md).toContain('# JobJoy Sample 1 — Design Review Feedback Pack');
    expect(md).toContain('Exported: 2026-04-24T21:30:00Z');
    expect(md).toContain('Reviewers: 2');
    expect(md).toContain('Pins: 2 (open: 1, resolved: 1)');
    expect(md).toContain('## Variant — Recommended');
    expect(md).toContain('### Pin 1 · Page 2 · Alice');
    expect(md).toContain('Position: 25.5% from left, 40.0% from top');
    expect(md).toContain('Status: Open');
    expect(md).toContain('**Alice** (2026-04-24T10:00:00Z):');
    expect(md).toContain('Heading too tight');
    expect(md).toContain('**Bob** (2026-04-24T10:30:00Z):');
    expect(md).toContain('Agreed, +1');
    expect(md).toContain('## Variant — Huashu');
    expect(md).toContain('### Pin 2 · Page 1 · Bob');
    expect(md).toContain('Status: Resolved 2026-04-24T12:00:00Z');
    expect(md).toContain('## Variant Picks');
    expect(md).toContain('- **Recommended** (rank 1, picked by Alice): Best balance');
  });

  it('omits the picks section when there are no picks', () => {
    const md = buildMarkdown({
      pins: [pinA],
      comments,
      picks: [],
      exportedAt: '2026-04-24T21:30:00Z'
    });
    expect(md).not.toContain('## Variant Picks');
  });

  it('orders variants by VARIANTS catalog order, not insertion', () => {
    const md = buildMarkdown({
      pins: [pinB, pinA], // input order huashu first, recommended second
      comments,
      picks: [],
      exportedAt: '2026-04-24T21:30:00Z'
    });
    const recIdx = md.indexOf('## Variant — Recommended');
    const huashuIdx = md.indexOf('## Variant — Huashu');
    expect(recIdx).toBeGreaterThan(0);
    expect(huashuIdx).toBeGreaterThan(0);
    expect(recIdx).toBeLessThan(huashuIdx);
  });

  it('exportFilename uses YYYY-MM-DD UTC', () => {
    const name = exportFilename(new Date('2026-04-24T23:30:00Z'));
    expect(name).toBe('jobjoy-feedback-2026-04-24.md');
  });
});
