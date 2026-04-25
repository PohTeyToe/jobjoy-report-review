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
});
