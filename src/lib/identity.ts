import { supabase } from './supabase';

const ID_KEY = 'jobjoy_review.reviewer_id';
const NAME_KEY = 'jobjoy_review.reviewer_name';

export type Identity = { id: string; name: string };

function readLs(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

/**
 * Returns the persisted identity, or null if no reviewer record exists yet.
 * Pure read — does NOT touch the network.
 */
export function getIdentity(): Identity | null {
  const id = readLs(ID_KEY);
  const name = readLs(NAME_KEY);
  if (!id || !name) return null;
  return { id, name };
}

/**
 * Insert a new reviewer row, persist the returned uuid + name to localStorage,
 * and return the resulting identity. Throws on failure so callers can show
 * an error in the modal.
 */
export async function setIdentity(name: string): Promise<Identity> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');

  const { data, error } = await supabase
    .from('reviewers')
    .insert({ name: trimmed })
    .select('id, name')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create reviewer');
  }

  const identity: Identity = { id: data.id as string, name: data.name as string };
  writeLs(ID_KEY, identity.id);
  writeLs(NAME_KEY, identity.name);
  return identity;
}

/**
 * Bump last_seen_at for the current reviewer. Best-effort — silently swallows
 * errors so a flaky network never blocks the page from rendering.
 */
export async function bumpLastSeen(): Promise<void> {
  const id = readLs(ID_KEY);
  if (!id) return;
  try {
    await supabase
      .from('reviewers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // ignore
  }
}

/** Test-only: wipe localStorage state so getIdentity() returns null. */
export function __clearIdentityForTests(): void {
  try {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
  } catch {
    // ignore
  }
}
