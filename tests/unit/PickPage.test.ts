import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

// Wire identity to a known reviewer so the page skips the modal.
// `getIdentity` is now async (returns a Promise<Identity | null>).
vi.mock('../../src/lib/identity', () => {
  return {
    getIdentity: vi.fn().mockResolvedValue({ id: 'rev-pp-1', name: 'Tester' }),
    bumpLastSeen: vi.fn().mockResolvedValue(undefined),
    setIdentity: vi.fn(),
    ensureSession: vi.fn().mockResolvedValue('rev-pp-1')
  };
});

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
            eq: vi.fn(() => ({ order: selectOrder }))
          })),
          delete: vi.fn(() => ({ eq: deleteEq })),
          insert: insertCall
        };
      })
    }
  };
});

import PickPage from '../../src/routes/pick/+page.svelte';
import { VARIANTS } from '../../src/lib/variants';

describe('PickPage', () => {
  beforeEach(() => {
    selectOrder.mockReset();
    deleteEq.mockReset();
    insertCall.mockReset();
    selectOrder.mockResolvedValue({ data: [], error: null });
    deleteEq.mockResolvedValue({ error: null });
    insertCall.mockResolvedValue({ error: null });
  });

  afterEach(() => cleanup());

  it('renders six cards in default catalog order', async () => {
    const { container } = render(PickPage, { props: {} });
    await waitFor(() => {
      const cards = container.querySelectorAll('[data-testid="pick-card"]');
      expect(cards.length).toBe(VARIANTS.length);
    });
    const cards = container.querySelectorAll('[data-testid="pick-card"]');
    Array.from(cards).forEach((card, i) => {
      expect(card.getAttribute('data-slug')).toBe(VARIANTS[i].slug);
      expect(card.getAttribute('data-rank')).toBe(String(i + 1));
    });
  });

  it('clicking a card promotes it to rank 1', async () => {
    const { container } = render(PickPage, { props: {} });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="pick-card"]').length).toBe(VARIANTS.length)
    );
    // Click the third card (impeccable in catalog).
    const target = container.querySelector(
      '[data-testid="pick-card"][data-slug="impeccable"]'
    ) as HTMLElement;
    await fireEvent.click(target);

    await waitFor(() => {
      const first = container.querySelector('[data-testid="pick-card"][data-rank="1"]');
      expect(first?.getAttribute('data-slug')).toBe('impeccable');
    });
  });

  it('Enter on a focused non-rank-1 card promotes it to rank 1', async () => {
    const { container } = render(PickPage, { props: {} });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="pick-card"]').length).toBe(VARIANTS.length)
    );

    const targetSlug = VARIANTS[2].slug;
    const card = container.querySelector(
      `[data-testid="pick-card"][data-slug="${targetSlug}"]`
    ) as HTMLElement;
    card.focus();
    await fireEvent.keyDown(card, { key: 'Enter' });

    await waitFor(() => {
      const rank1 = container.querySelector('[data-testid="pick-card"][data-rank="1"]');
      expect(rank1?.getAttribute('data-slug')).toBe(targetSlug);
    });
  });

  it('Space on a focused non-rank-1 card promotes it to rank 1', async () => {
    const { container } = render(PickPage, { props: {} });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="pick-card"]').length).toBe(VARIANTS.length)
    );

    const targetSlug = VARIANTS[4].slug;
    const card = container.querySelector(
      `[data-testid="pick-card"][data-slug="${targetSlug}"]`
    ) as HTMLElement;
    card.focus();
    await fireEvent.keyDown(card, { key: ' ' });

    await waitFor(() => {
      const rank1 = container.querySelector('[data-testid="pick-card"][data-rank="1"]');
      expect(rank1?.getAttribute('data-slug')).toBe(targetSlug);
    });
  });

  it('arrow-down on a focused card moves it down one rank', async () => {
    const { container } = render(PickPage, { props: {} });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="pick-card"]').length).toBe(VARIANTS.length)
    );

    const firstSlug = VARIANTS[0].slug;
    const card = container.querySelector(
      `[data-testid="pick-card"][data-slug="${firstSlug}"]`
    ) as HTMLElement;
    card.focus();
    await fireEvent.keyDown(card, { key: 'ArrowDown' });

    await waitFor(() => {
      const newSecond = container.querySelector('[data-testid="pick-card"][data-rank="2"]');
      expect(newSecond?.getAttribute('data-slug')).toBe(firstSlug);
    });
  });

  it('drag start → drop reorders the list', async () => {
    const { container } = render(PickPage, { props: {} });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="pick-card"]').length).toBe(VARIANTS.length)
    );

    const fromSlug = VARIANTS[5].slug; // baseline
    const fromCard = container.querySelector(
      `[data-testid="pick-card"][data-slug="${fromSlug}"]`
    ) as HTMLElement;
    const toCard = container.querySelector(
      '[data-testid="pick-card"][data-rank="1"]'
    ) as HTMLElement;

    // Build a stub DataTransfer-ish object jsdom is happy with.
    const dataMap = new Map<string, string>();
    const dt = {
      effectAllowed: '',
      dropEffect: '',
      setData(type: string, val: string) {
        dataMap.set(type, val);
      },
      getData(type: string) {
        return dataMap.get(type) ?? '';
      }
    } as unknown as DataTransfer;

    await fireEvent.dragStart(fromCard, { dataTransfer: dt });
    await fireEvent.dragOver(toCard, { dataTransfer: dt });
    await fireEvent.drop(toCard, { dataTransfer: dt });

    await waitFor(() => {
      const rank1 = container.querySelector('[data-testid="pick-card"][data-rank="1"]');
      expect(rank1?.getAttribute('data-slug')).toBe(fromSlug);
    });
  });

  it('submit calls supabase delete + insert and shows confirmation', async () => {
    const { container, getByTestId } = render(PickPage, { props: {} });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="pick-card"]').length).toBe(VARIANTS.length)
    );
    // Wait for the async getIdentity to land — the reviewer-name node only
    // renders once `identity` is non-null.
    await waitFor(() => expect(getByTestId('reviewer-name')).toBeTruthy());

    const submitBtn = getByTestId('pick-submit') as HTMLButtonElement;
    await fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(deleteEq).toHaveBeenCalledTimes(1);
      expect(insertCall).toHaveBeenCalledTimes(1);
    });
    const rows = insertCall.mock.calls[0][0] as Array<{ ranking: number }>;
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.ranking).sort()).toEqual([1, 2, 3, 4, 5, 6]);

    await waitFor(() => {
      expect(getByTestId('pick-submitted-flag')).toBeTruthy();
    });
  });
});
