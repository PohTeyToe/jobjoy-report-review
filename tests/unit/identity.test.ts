import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase module BEFORE importing the SUT so the singleton client
// never tries to hit a real network.
const insertSelectSingle = vi.fn();
const updateEq = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((_table: string) => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: insertSelectSingle
          }))
        })),
        update: vi.fn(() => ({
          eq: updateEq
        }))
      }))
    }
  };
});

import {
  getIdentity,
  setIdentity,
  bumpLastSeen,
  __clearIdentityForTests
} from '../../src/lib/identity';

describe('identity', () => {
  beforeEach(() => {
    __clearIdentityForTests();
    insertSelectSingle.mockReset();
    updateEq.mockReset();
  });

  it('getIdentity returns null when localStorage is empty', () => {
    expect(getIdentity()).toBeNull();
  });

  it('setIdentity inserts a reviewer row and persists id+name', async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: { id: 'uuid-123', name: 'Alice' },
      error: null
    });

    const id = await setIdentity('Alice');
    expect(id).toEqual({ id: 'uuid-123', name: 'Alice' });

    const persisted = getIdentity();
    expect(persisted).toEqual({ id: 'uuid-123', name: 'Alice' });
  });

  it('setIdentity rejects empty names without hitting the network', async () => {
    await expect(setIdentity('   ')).rejects.toThrow(/required/i);
    expect(insertSelectSingle).not.toHaveBeenCalled();
  });

  it('setIdentity surfaces supabase errors', async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'rls denied' }
    });
    await expect(setIdentity('Bob')).rejects.toThrow(/rls denied/);
  });

  it('bumpLastSeen calls update().eq() when an id is stored', async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: { id: 'uuid-xyz', name: 'Carol' },
      error: null
    });
    await setIdentity('Carol');
    updateEq.mockResolvedValueOnce({ data: null, error: null });
    await bumpLastSeen();
    expect(updateEq).toHaveBeenCalledTimes(1);
    expect(updateEq).toHaveBeenCalledWith('id', 'uuid-xyz');
  });

  it('bumpLastSeen is a no-op when no identity is stored', async () => {
    await bumpLastSeen();
    expect(updateEq).not.toHaveBeenCalled();
  });
});
