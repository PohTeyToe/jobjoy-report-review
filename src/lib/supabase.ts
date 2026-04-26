import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

/**
 * Singleton Supabase client. After the anonymous-auth migration this client
 * holds the JWT for an authenticated (anon-auth) user — `auth.uid()` is real
 * and RLS policies depend on it.
 *
 * Auth options:
 *   - persistSession: true     — JWT lives in localStorage so a page reload
 *                                or new tab keeps the same identity.
 *   - autoRefreshToken: true   — refreshes silently in the background.
 *   - detectSessionInUrl: false — anonymous sign-in never produces a redirect
 *                                callback; turning this off avoids spurious
 *                                URL rewrites on /review.
 */
export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
  db: { schema: 'design_review' },
  realtime: { params: { eventsPerSecond: 10 } },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
