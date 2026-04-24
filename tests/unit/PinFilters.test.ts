import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import PinFilters from '../../src/lib/admin/PinFilters.svelte';
import { defaultFilters } from '../../src/lib/admin/admin-store.svelte';

describe('PinFilters', () => {
  afterEach(() => cleanup());

  it('toggling a variant checkbox emits an update with that variant added', async () => {
    const onchange = vi.fn();
    const { getByTestId } = render(PinFilters, {
      props: { filters: defaultFilters(), reviewers: [], onchange }
    });
    await fireEvent.click(getByTestId('filter-variant-recommended'));
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange.mock.calls[0][0].variants).toEqual(['recommended']);
  });

  it('toggling a reviewer checkbox emits an update with that reviewer added', async () => {
    const onchange = vi.fn();
    const reviewers = [{ id: 'rev-1', name: 'Alice' }];
    const { getByTestId } = render(PinFilters, {
      props: { filters: defaultFilters(), reviewers, onchange }
    });
    await fireEvent.click(getByTestId('filter-reviewer-rev-1'));
    expect(onchange).toHaveBeenCalledTimes(1);
    expect(onchange.mock.calls[0][0].reviewerIds).toEqual(['rev-1']);
  });

  it('status buttons toggle the resolved value', async () => {
    const onchange = vi.fn();
    const { getByTestId } = render(PinFilters, {
      props: { filters: defaultFilters(), reviewers: [], onchange }
    });
    await fireEvent.click(getByTestId('filter-status-resolved'));
    expect(onchange.mock.calls[0][0].resolved).toBe('resolved');
  });

  it('date inputs emit normalized ISO strings or null', async () => {
    const onchange = vi.fn();
    const { getByTestId } = render(PinFilters, {
      props: { filters: defaultFilters(), reviewers: [], onchange }
    });
    const from = getByTestId('filter-date-from') as HTMLInputElement;
    await fireEvent.change(from, { target: { value: '2026-04-20' } });
    expect(onchange.mock.calls[0][0].dateFrom).toBe('2026-04-20');
  });
});
