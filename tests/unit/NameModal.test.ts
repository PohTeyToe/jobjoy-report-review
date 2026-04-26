import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

// NameModal now goes through setIdentity → ensureSession (anon sign-in) →
// reviewers.upsert. This mock has to satisfy the full chain. References
// inside vi.mock factories must be hoisted via vi.hoisted.
const h = vi.hoisted(() => ({
  state: { current: null as { user: { id: string } } | null },
  upsertSingle: vi.fn(),
  signInAnon: vi.fn()
}));

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: h.state.current } })),
        signInAnonymously: h.signInAnon,
        signOut: vi.fn(async () => ({ error: null }))
      },
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({ single: h.upsertSingle }))
        })),
        update: vi.fn(() => ({ eq: vi.fn() }))
      }))
    }
  };
});

import NameModal from '../../src/lib/NameModal.svelte';
import { __clearIdentityForTests } from '../../src/lib/identity';

describe('NameModal', () => {
  beforeEach(async () => {
    h.upsertSingle.mockReset();
    h.signInAnon.mockReset();
    h.state.current = null;
    await __clearIdentityForTests();
  });

  afterEach(() => cleanup());

  it('disables submit until a name is entered', async () => {
    const { getByTestId } = render(NameModal, { props: {} });
    const submit = getByTestId('name-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const input = getByTestId('name-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Dana' } });
    expect(submit.disabled).toBe(false);
  });

  it('whitespace-only submit is blocked (no upsert call)', async () => {
    const { getByTestId } = render(NameModal, { props: {} });
    const input = getByTestId('name-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '   ' } });
    const submit = getByTestId('name-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fireEvent.click(submit);
    expect(h.upsertSingle).not.toHaveBeenCalled();
    expect(h.signInAnon).not.toHaveBeenCalled();
  });

  it('valid submit signs in anonymously then upserts, then onidentity fires', async () => {
    h.signInAnon.mockResolvedValueOnce({
      data: { user: { id: 'auth-uid-eve' } },
      error: null
    });
    h.upsertSingle.mockResolvedValueOnce({
      data: { id: 'auth-uid-eve', name: 'Eve' },
      error: null
    });
    const onidentity = vi.fn();
    const { getByTestId } = render(NameModal, { props: { onidentity } });

    const input = getByTestId('name-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Eve' } });
    await fireEvent.click(getByTestId('name-submit'));

    await waitFor(() =>
      expect(onidentity).toHaveBeenCalledWith({ id: 'auth-uid-eve', name: 'Eve' })
    );
    expect(h.signInAnon).toHaveBeenCalledTimes(1);
  });
});
