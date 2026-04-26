import { supabase } from './supabase';

/**
 * Identity layer — Supabase Anonymous Auth edition.
 *
 * Previously: a client-generated UUID lived in localStorage and was inserted
 * straight into design_review.reviewers. Anyone could spoof another reviewer
 * by editing their localStorage. RLS could not enforce author-only writes
 * because there was no real `auth.uid()`.
 *
 * Now: identity = Supabase auth user (created via `signInAnonymously()`).
 * - First visit: NameModal calls setIdentity() -> signInAnonymously(), then
 *   upsert reviewers row with id = auth.uid() and the user-supplied name.
 * - Returning visit: Supabase persists the JWT in localStorage automatically;
 *   we read it via auth.getSession() and look up the reviewers row.
 * - The `reviewers.id` column is FK'd to `auth.users(id)` so the identity is
 *   structurally enforced.
 *
 * `Identity` shape unchanged: { id: string; name: string }. `id` is now the
 * auth.uid() rather than a free-floating UUID.
 */

export type Identity = { id: string; name: string };

/**
 * Returns the existing identity (signed-in auth user + reviewers row) without
 * triggering a new anonymous sign-in. Resolves to null when:
 *   - no auth session exists yet (first visit), OR
 *   - a session exists but no reviewers row was ever created (NameModal was
 *     dismissed mid-flow, or sign-in succeeded but the row insert failed).
 *
 * The latter is the case the NameModal must handle: session present, no row.
 */
export async function getIdentity(): Promise<Identity | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from('reviewers')
    .select('id, name')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id as string, name: data.name as string };
}

/**
 * Ensure an auth session exists. If none, sign in anonymously. Returns the
 * resulting auth user id, or throws.
 *
 * Exposed as a separate primitive so tests can stub it and the NameModal
 * flow can branch on "session exists, no row" vs "no session at all".
 */
export async function ensureSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user?.id) return existing.session.user.id;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Anonymous sign-in failed');
  }
  return data.user.id;
}

/**
 * Establish identity end-to-end:
 *   1. ensureSession() — anon sign-in if needed.
 *   2. upsert reviewers row keyed by auth.uid() with the user-supplied name.
 *
 * Upsert semantics: if a row already exists for this auth.uid() (e.g. user
 * resubmits modal with a new name) the name is overwritten. RLS allows it
 * via "auth update own reviewer".
 */
export async function setIdentity(name: string): Promise<Identity> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required');

  const userId = await ensureSession();

  const { data, error } = await supabase
    .from('reviewers')
    .upsert({ id: userId, name: trimmed, last_seen_at: new Date().toISOString() })
    .select('id, name')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create reviewer');
  }

  return { id: data.id as string, name: data.name as string };
}

/**
 * Best-effort `last_seen_at` bump. Reads the auth session from the in-memory
 * Supabase client — no extra round-trip just to learn the id.
 */
export async function bumpLastSeen(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) return;
  try {
    await supabase
      .from('reviewers')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // ignore — non-critical
  }
}

/**
 * Test-only: sign out so subsequent getIdentity() returns null. Used by tests
 * that want to simulate a fresh visitor.
 */
export async function __clearIdentityForTests(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore
  }
}
