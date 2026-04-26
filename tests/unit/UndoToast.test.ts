import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import UndoToast from '../../src/lib/UndoToast.svelte';

describe('UndoToast', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the message and an Undo button', () => {
    const { getByTestId } = render(UndoToast, {
      props: {
        message: 'Pin deleted',
        onUndo: vi.fn(),
        onDismiss: vi.fn()
      }
    });
    expect(getByTestId('undo-toast-message').textContent).toBe('Pin deleted');
    expect(getByTestId('undo-toast-undo')).toBeTruthy();
  });

  it('clicking Undo invokes onUndo and not onDismiss', async () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    const { getByTestId } = render(UndoToast, {
      props: { message: 'x', duration: 5000, onUndo, onDismiss }
    });
    await fireEvent.click(getByTestId('undo-toast-undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
    // Even after the duration elapses, onDismiss must not fire — we cleared
    // the timer in the click handler.
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('auto-dismisses after the configured duration', () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(UndoToast, {
      props: { message: 'x', duration: 5000, onUndo, onDismiss }
    });
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('clears the timer on unmount so onDismiss does not fire after unmount', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { unmount } = render(UndoToast, {
      props: { message: 'x', duration: 5000, onUndo: vi.fn(), onDismiss }
    });
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
