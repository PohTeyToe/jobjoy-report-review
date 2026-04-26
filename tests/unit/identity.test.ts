import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Identity layer tests — Supabase Anonymous Auth edition.
 *
 * The supabase client is fully stubbed: we control session state, the result
 * of signInAnonymously, and the result of from('reviewers').{select,upsert,
 * update}.eq()/maybeSingle()/single(). Identity is no longer backed by
 * localStorage — these tests verify the auth.uid() lookup + reviewers-row
 * upsert flow that replaced it.
 */

// vi.mock is hoisted above all imports; references inside the factory must
// also be hoisted. vi.hoisted runs before the mock factory and shares the
// resulting object with the rest of the test module.
const h = vi.hoisted(() => ({
  state: { current: null as { user: { id: string } } | null },
  signInAnon: vi.fn(),
  upsertSingle: vi.fn(),
  selectMaybeSingle: vi.fn(),
  updateEq: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: h.state.current } })),
        signInAnonymously: h.signInAnon,
        signOut: h.signOut
      },
      from: vi.fn((table: string) => {
        if (table !== 'reviewers') throw new Error(`unexpected table ${table}`);
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: h.selectMaybeSingle
            }))
          })),
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: h.upsertSingle
            }))
          })),
          update: vi.fn(() => ({
            eq: h.updateEq
          }))
        };
      })
    }
  };
});

import {
  getIdentity,
  setIdentity,
  ensureSession,
  bumpLastSeen,
  __clearIdentityForTests
} from '../../src/lib/identity';

describe('identity (anon-auth edition)', () => {
  beforeEach(async () => {
    h.state.current = null;
    h.signInAnon.mockReset();
    h.upsertSingle.mockReset();
    h.selectMaybeSingle.mockReset();
    h.updateEq.mockReset();
    h.signOut.mockReset();
    await __clearIdentityForTests();
  });

  it('getIdentity returns null when there is no auth session', async () => {
    expect(await getIdentity()).toBeNull();
  });

  it('getIdentity returns null when session exists but no reviewer row', async () => {
    h.state.current = { user: { id: 'auth-uid-1' } };
    h.selectMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await getIdentity()).toBeNull();
  });

  it('getIdentity returns the persisted reviewer row when both exist', async () => {
    h.state.current = { user: { id: 'auth-uid-2' } };
    h.selectMaybeSingle.mockResolvedValueOnce({
      data: { id: 'auth-uid-2', name: 'Alice' },
      error: null
    });
    expect(await getIdentity()).toEqual({ id: 'auth-uid-2', name: 'Alice' });
  });

  it('ensureSession signs in anonymously when no session exists', async () => {
    h.signInAnon.mockResolvedValueOnce({
      data: { user: { id: 'new-anon-uid' } },
      error: null
    });
    expect(await ensureSession()).toBe('new-anon-uid');
    expect(h.signInAnon).toHaveBeenCalledTimes(1);
  });

  it('ensureSession reuses an existing session without signing in again', async () => {
    h.state.current = { user: { id: 'existing-uid' } };
    expect(await ensureSession()).toBe('existing-uid');
    expect(h.signInAnon).not.toHaveBeenCalled();
  });

  it('ensureSession surfaces signInAnonymously errors', async () => {
    h.signInAnon.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'anon disabled' }
    });
    await expect(ensureSession()).rejects.toThrow(/anon disabled/);
  });

  it('setIdentity rejects empty names without hitting the network', async () => {
    await expect(setIdentity('   ')).rejects.toThrow(/required/i);
    expect(h.signInAnon).not.toHaveBeenCalled();
    expect(h.upsertSingle).not.toHaveBeenCalled();
  });

  it('setIdentity signs in then upserts a reviewers row keyed by auth.uid()', async () => {
    h.signInAnon.mockResolvedValueOnce({
      data: { user: { id: 'fresh-uid' } },
      error: null
    });
    h.upsertSingle.mockResolvedValueOnce({
      data: { id: 'fresh-uid', name: 'Bob' },
      error: null
    });
    expect(await setIdentity('Bob')).toEqual({ id: 'fresh-uid', name: 'Bob' });
    expect(h.signInAnon).toHaveBeenCalledTimes(1);
  });

  it('setIdentity surfaces an upsert RLS error', async () => {
    h.signInAnon.mockResolvedValueOnce({
      data: { user: { id: 'rls-uid' } },
      error: null
    });
    h.upsertSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'rls denied' }
    });
    await expect(setIdentity('Carol')).rejects.toThrow(/rls denied/);
  });

  it('bumpLastSeen is a no-op when no session exists', async () => {
    await bumpLastSeen();
    expect(h.updateEq).not.toHaveBeenCalled();
  });

  it('bumpLastSeen updates the row keyed on the current auth.uid()', async () => {
    h.state.current = { user: { id: 'live-uid' } };
    h.updateEq.mockResolvedValueOnce({ data: null, error: null });
    await bumpLastSeen();
    expect(h.updateEq).toHaveBeenCalledTimes(1);
    expect(h.updateEq).toHaveBeenCalledWith('id', 'live-uid');
  });
});
