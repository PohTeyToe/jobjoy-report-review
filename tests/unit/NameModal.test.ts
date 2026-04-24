import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

const insertSelectSingle = vi.fn();

vi.mock('../../src/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: insertSelectSingle }))
        })),
        update: vi.fn(() => ({ eq: vi.fn() }))
      }))
    }
  };
});

import NameModal from '../../src/lib/NameModal.svelte';
import { __clearIdentityForTests } from '../../src/lib/identity';

describe('NameModal', () => {
  beforeEach(() => {
    insertSelectSingle.mockReset();
    __clearIdentityForTests();
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

  it('whitespace-only submit is blocked (no insert call)', async () => {
    const { getByTestId } = render(NameModal, { props: {} });
    const input = getByTestId('name-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '   ' } });
    const submit = getByTestId('name-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await fireEvent.click(submit);
    expect(insertSelectSingle).not.toHaveBeenCalled();
  });

  it('valid submit calls onidentity with the new id+name', async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: { id: 'uuid-42', name: 'Eve' },
      error: null
    });
    const onidentity = vi.fn();
    const { getByTestId } = render(NameModal, { props: { onidentity } });

    const input = getByTestId('name-input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Eve' } });
    await fireEvent.click(getByTestId('name-submit'));

    await waitFor(() => expect(onidentity).toHaveBeenCalledWith({ id: 'uuid-42', name: 'Eve' }));
  });
});
