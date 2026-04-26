import { describe, it, expect, vi, beforeEach } from 'vitest';

type Handler = (payload: unknown) => void;

const onCalls: Array<{ event: string; cfg: Record<string, unknown>; handler: Handler }> = [];
const removed: unknown[] = [];

const channelMock = {
  on(event: string, cfg: Record<string, unknown>, handler: Handler) {
    onCalls.push({ event, cfg, handler });
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
      removeChannel: vi.fn((c: unknown) => {
        removed.push(c);
      })
    }
  };
});

import { subscribePinsForVariant, subscribeCommentsForThread } from '../../src/lib/realtime';

describe('realtime subscriptions', () => {
  beforeEach(() => {
    onCalls.length = 0;
    removed.length = 0;
  });

  it('subscribePinsForVariant registers INSERT/UPDATE/DELETE handlers for the variant filter', () => {
    const cb = vi.fn();
    const off = subscribePinsForVariant('recommended', cb);

    expect(onCalls).toHaveLength(3);
    expect(onCalls.map((c) => c.cfg.event)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
    for (const c of onCalls) {
      expect(c.cfg.schema).toBe('design_review');
      expect(c.cfg.table).toBe('pins');
      expect(c.cfg.filter).toBe('variant=eq.recommended');
    }

    // Fire an INSERT through the registered handler.
    const insertHandler = onCalls.find((c) => c.cfg.event === 'INSERT')!.handler;
    insertHandler({ new: { id: 'pin-1', variant: 'recommended' } });
    expect(cb).toHaveBeenCalledWith({
      type: 'INSERT',
      new: { id: 'pin-1', variant: 'recommended' }
    });

    off();
    expect(removed).toHaveLength(1);
  });

  it('subscribeCommentsForThread registers INSERT + DELETE handlers filtered on pin_id', () => {
    const cb = vi.fn();
    const off = subscribeCommentsForThread('pin-xyz', cb);
    // After author-only delete shipped, comments now register both INSERT
    // and DELETE handlers — every change goes back to the parent.
    expect(onCalls).toHaveLength(2);
    expect(onCalls.map((c) => c.cfg.event).sort()).toEqual(['DELETE', 'INSERT']);
    for (const c of onCalls) {
      expect(c.cfg.filter).toBe('pin_id=eq.pin-xyz');
      expect(c.cfg.table).toBe('comments');
    }

    const insertHandler = onCalls.find((c) => c.cfg.event === 'INSERT')!.handler;
    insertHandler({
      new: {
        id: 'c1',
        pin_id: 'pin-xyz',
        reviewer_id: 'rev-1',
        body: 'hi',
        created_at: '2026-04-24T00:00:00Z'
      }
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].type).toBe('INSERT');

    const deleteHandler = onCalls.find((c) => c.cfg.event === 'DELETE')!.handler;
    deleteHandler({ old: { id: 'c1' } });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1][0]).toEqual({ type: 'DELETE', old: { id: 'c1' } });

    off();
    expect(removed).toHaveLength(1);
  });
});
