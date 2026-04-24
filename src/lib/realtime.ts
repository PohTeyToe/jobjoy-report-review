import { supabase } from './supabase';
import type { VariantSlug } from './variants';

/**
 * Realtime subscription helpers for the design_review schema.
 *
 * Both functions return an unsubscribe function. Callers (Svelte components)
 * are responsible for invoking it on unmount or when scope changes.
 *
 * Channel naming is unique-per-scope so multiple subscribers (e.g. /review
 * page + open ThreadPanel) don't collide.
 */

export type PinChangeEvent =
  | { type: 'INSERT'; new: PinRow }
  | { type: 'UPDATE'; new: PinRow; old: Partial<PinRow> }
  | { type: 'DELETE'; old: Partial<PinRow> };

export type CommentChangeEvent = { type: 'INSERT'; new: CommentRow };

export type PinRow = {
  id: string;
  variant: VariantSlug;
  page_index: number;
  x_pct: number;
  y_pct: number;
  reviewer_id: string;
  resolved_at: string | null;
  created_at: string;
};

export type CommentRow = {
  id: string;
  pin_id: string;
  reviewer_id: string;
  body: string;
  created_at: string;
};

/**
 * Subscribe to INSERT / UPDATE / DELETE on `design_review.pins` for the
 * supplied variant. Returns an unsubscribe fn.
 */
export function subscribePinsForVariant(
  variant: VariantSlug,
  onChange: (ev: PinChangeEvent) => void
): () => void {
  // Suffix with a random tag so a remount doesn't reuse the previous channel
  // name before the server has torn it down (which can cause the new
  // subscription to silently inherit the closed state).
  const tag = Math.random().toString(36).slice(2, 8);
  const channel = supabase.channel(`pins:${variant}:${tag}`);

  const filter = `variant=eq.${variant}`;
  const schema = 'design_review';

  channel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema, table: 'pins', filter },
      (payload: { new: PinRow }) => onChange({ type: 'INSERT', new: payload.new })
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema, table: 'pins', filter },
      (payload: { new: PinRow; old: Partial<PinRow> }) =>
        onChange({ type: 'UPDATE', new: payload.new, old: payload.old })
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema, table: 'pins', filter },
      (payload: { old: Partial<PinRow> }) => onChange({ type: 'DELETE', old: payload.old })
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[realtime] channel error:', status);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to new comments on a single thread. INSERT-only because Phase 3
 * doesn't allow comment edits or deletes.
 */
export function subscribeCommentsForThread(
  pinId: string,
  onChange: (ev: CommentChangeEvent) => void
): () => void {
  const tag = Math.random().toString(36).slice(2, 8);
  const channel = supabase.channel(`comments:${pinId}:${tag}`);

  channel
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'design_review',
        table: 'comments',
        filter: `pin_id=eq.${pinId}`
      },
      (payload: { new: CommentRow }) => onChange({ type: 'INSERT', new: payload.new })
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('[realtime] channel error:', status);
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
