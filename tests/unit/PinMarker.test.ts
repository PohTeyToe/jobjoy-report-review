import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import PinMarker from '../../src/lib/PinMarker.svelte';

describe('PinMarker', () => {
  afterEach(() => cleanup());

  it('renders with the supplied numeric index', () => {
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-1', index: 3 }
    });
    const btn = getByTestId('pin-marker');
    expect(btn.textContent?.trim()).toBe('3');
    expect(btn.getAttribute('data-pin-id')).toBe('pin-1');
    expect(btn.getAttribute('aria-label')).toContain('Pin 3');
  });

  it('clicking dispatches onopen with the pin id', async () => {
    const onopen = vi.fn();
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-abc', index: 1, onopen }
    });
    await fireEvent.click(getByTestId('pin-marker'));
    expect(onopen).toHaveBeenCalledWith('pin-abc');
  });

  it('marks optimistic state via data attribute', () => {
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-2', index: 2, isOptimistic: true }
    });
    expect(getByTestId('pin-marker').getAttribute('data-optimistic')).toBe('true');
  });

  it('marks resolved state via data-resolved attribute and aria-label', () => {
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-r', index: 4, isResolved: true }
    });
    const btn = getByTestId('pin-marker');
    expect(btn.getAttribute('data-resolved')).toBe('true');
    expect(btn.getAttribute('aria-label')).toContain('resolved');
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('does not set data-resolved when not resolved', () => {
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-u', index: 5, isResolved: false }
    });
    expect(getByTestId('pin-marker').getAttribute('data-resolved')).toBeNull();
  });

  it('hides the trash chip by default (canDelete=false)', () => {
    const { queryByTestId } = render(PinMarker, {
      props: { id: 'pin-x', index: 6 }
    });
    expect(queryByTestId('pin-delete')).toBeNull();
  });

  it('shows the trash chip when canDelete=true and not optimistic', async () => {
    const ondelete = vi.fn();
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-y', index: 7, canDelete: true, ondelete }
    });
    const chip = getByTestId('pin-delete');
    expect(chip).toBeTruthy();
    await fireEvent.click(chip);
    expect(ondelete).toHaveBeenCalledWith('pin-y');
  });

  it('hides the trash chip while optimistic, even when canDelete=true', () => {
    const { queryByTestId } = render(PinMarker, {
      props: { id: 'pin-z', index: 8, canDelete: true, isOptimistic: true }
    });
    expect(queryByTestId('pin-delete')).toBeNull();
  });

  it('clicking the trash chip does NOT trigger onopen (stopPropagation)', async () => {
    const onopen = vi.fn();
    const ondelete = vi.fn();
    const { getByTestId } = render(PinMarker, {
      props: { id: 'pin-w', index: 9, canDelete: true, onopen, ondelete }
    });
    await fireEvent.click(getByTestId('pin-delete'));
    expect(ondelete).toHaveBeenCalledTimes(1);
    expect(onopen).not.toHaveBeenCalled();
  });
});
