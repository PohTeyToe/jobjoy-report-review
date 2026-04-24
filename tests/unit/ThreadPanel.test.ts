import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';

const channelMock = {
  on() {
    return channelMock;
  },
  subscribe() {
    return channelMock;
  }
};

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      channel: vi.fn(() => channelMock),
      removeChannel: vi.fn(),
      from: vi.fn(() => {
        // Catch-all so any accidental DB call from the panel resolves cleanly.
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => builder),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn(() => builder),
          update: vi.fn(() => builder)
        };
        return builder;
      })
    }
  };
});

import ThreadPanel from '../../src/lib/ThreadPanel.svelte';
import { createPinStore, type Pin, type Thread } from '../../src/lib/pin-store.svelte';
import type { VariantSlug } from '../../src/lib/variants';

function makeThread(): Thread {
  const pin: Pin = {
    id: 'pin-1',
    variant: 'recommended' as VariantSlug,
    page_index: 2,
    x_pct: 10,
    y_pct: 20,
    reviewer_id: 'rev-1',
    reviewer_name: 'Alice',
    resolved_at: null,
    created_at: '2026-04-24T00:00:00Z'
  };
  return {
    pin,
    comments: [
      {
        id: 'c1',
        pin_id: 'pin-1',
        reviewer_id: 'rev-1',
        reviewer_name: 'Alice',
        body: 'first comment',
        created_at: '2026-04-24T00:00:00Z'
      },
      {
        id: 'c2',
        pin_id: 'pin-1',
        reviewer_id: 'rev-2',
        reviewer_name: 'Bob',
        body: 'second comment',
        created_at: '2026-04-24T01:00:00Z'
      }
    ]
  };
}

describe('ThreadPanel', () => {
  beforeEach(() => {
    // jsdom defaults
  });
  afterEach(() => cleanup());

  it('renders nothing when pinId is null', () => {
    const store = createPinStore();
    const { queryByTestId } = render(ThreadPanel, {
      props: {
        pinId: null,
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose: () => {}
      }
    });
    expect(queryByTestId('thread-panel')).toBeNull();
  });

  it('renders pin metadata and comment list when activeThread is set', async () => {
    const store = createPinStore();
    store.__setPinsForTests([makeThread().pin]);
    store.__setActiveThreadForTests(makeThread());
    const { getByTestId, getAllByTestId } = render(ThreadPanel, {
      props: {
        pinId: 'pin-1',
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose: () => {}
      }
    });
    expect(getByTestId('thread-panel')).toBeTruthy();
    expect(getByTestId('thread-title').textContent).toContain('page 3');
    const comments = getAllByTestId('thread-comment');
    expect(comments).toHaveLength(2);
    expect(comments[0].textContent).toContain('first comment');
    expect(comments[1].textContent).toContain('second comment');
  });

  it('Escape key triggers onclose', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(makeThread());
    const onclose = vi.fn();
    render(ThreadPanel, {
      props: {
        pinId: 'pin-1',
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose
      }
    });
    await fireEvent.keyDown(document, { key: 'Escape' });
    expect(onclose).toHaveBeenCalled();
  });

  it('close button triggers onclose', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(makeThread());
    const onclose = vi.fn();
    const { getByTestId } = render(ThreadPanel, {
      props: {
        pinId: 'pin-1',
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose
      }
    });
    await fireEvent.click(getByTestId('thread-close'));
    expect(onclose).toHaveBeenCalled();
  });

  it('reply submit calls store.addComment with body + identity', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(makeThread());
    const spy = vi.spyOn(store, 'addComment').mockImplementation(async () => undefined);
    const { getByTestId } = render(ThreadPanel, {
      props: {
        pinId: 'pin-1',
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose: () => {}
      }
    });
    const textarea = getByTestId('thread-reply-input') as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: 'great work' } });
    await fireEvent.click(getByTestId('thread-reply-submit'));
    expect(spy).toHaveBeenCalledWith('pin-1', 'great work', { id: 'rev-1', name: 'Alice' });
  });

  it('resolve toggle calls store.toggleResolved', async () => {
    const store = createPinStore();
    store.__setActiveThreadForTests(makeThread());
    const spy = vi.spyOn(store, 'toggleResolved').mockImplementation(async () => undefined);
    const { getByTestId } = render(ThreadPanel, {
      props: {
        pinId: 'pin-1',
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose: () => {}
      }
    });
    await fireEvent.click(getByTestId('thread-resolve-toggle'));
    expect(spy).toHaveBeenCalledWith('pin-1');
  });

  it('shows Resolved badge when pin.resolved_at is set', () => {
    const store = createPinStore();
    const t = makeThread();
    t.pin.resolved_at = '2026-04-24T03:00:00Z';
    store.__setActiveThreadForTests(t);
    const { getByTestId } = render(ThreadPanel, {
      props: {
        pinId: 'pin-1',
        store,
        identity: { id: 'rev-1', name: 'Alice' },
        onclose: () => {}
      }
    });
    expect(getByTestId('thread-resolved-badge')).toBeTruthy();
    expect(getByTestId('thread-resolve-toggle').textContent).toContain('Reopen');
  });
});
