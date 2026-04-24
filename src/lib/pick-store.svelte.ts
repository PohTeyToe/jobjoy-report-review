import { supabase } from './supabase';
import { VARIANTS, type VariantSlug } from './variants';

/**
 * Persisted shape of a row in `design_review.variant_picks`.
 *
 * One row per (reviewer, variant). The reviewer's overall freeform `notes`
 * is denormalized onto the rank-1 row only — every other rank stores
 * `null` for `notes`. This keeps the table append-light and avoids a
 * separate `pick_sessions` table for v1.
 */
export type PickRow = {
  reviewer_id: string;
  variant: VariantSlug;
  ranking: number;
  notes: string | null;
};

const DEFAULT_RANKING: VariantSlug[] = VARIANTS.map((v) => v.slug);

/**
 * Reactive store for the /pick surface. Owns the live ranking, the
 * freeform notes textarea, the submitted/error flags, and the network
 * round-trips to Supabase.
 *
 * Re-submission strategy: delete + reinsert. The `variant_picks` table has
 * no natural unique key beyond (reviewer_id, variant), and the RLS policy
 * grants anon DELETE on rows the reviewer already inserted, so a clean
 * wipe-and-replace beats juggling upsert semantics. A reviewer changing
 * their mind is the unhappy path we optimize against, not the happy one.
 */
export class PickStore {
  ranking = $state<VariantSlug[]>([...DEFAULT_RANKING]);
  notes = $state('');
  submitted = $state(false);
  submitError = $state<string | null>(null);
  loading = $state(false);
  submitting = $state(false);

  /** Move the variant at `from` to position `to`, shifting the rest. */
  reorder(from: number, to: number): void {
    if (from === to) return;
    if (from < 0 || to < 0 || from >= this.ranking.length || to >= this.ranking.length) return;
    const next = [...this.ranking];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    this.ranking = next;
  }

  /** Promote a variant to rank 1 (top), shifting others down. */
  promoteToTop(slug: VariantSlug): void {
    const idx = this.ranking.indexOf(slug);
    if (idx <= 0) return;
    this.reorder(idx, 0);
  }

  /**
   * Fetch any prior picks for this reviewer. If found, hydrate `ranking`
   * and `notes` from them and mark `submitted = true`. Best-effort: a
   * fetch failure leaves the defaults in place.
   */
  async loadExisting(reviewerId: string): Promise<void> {
    this.loading = true;
    try {
      const { data, error } = await supabase
        .from('variant_picks')
        .select('reviewer_id, variant, ranking, notes')
        .eq('reviewer_id', reviewerId)
        .order('ranking', { ascending: true });

      if (error) {
        console.error('[pick-store] loadExisting failed:', error);
        return;
      }

      const rows = (data ?? []) as PickRow[];
      if (rows.length === 0) return;

      // Sort defensively; populate ranking from the rows, falling back to
      // catalog order for any variant the prior submission didn't include.
      const ordered = rows
        .slice()
        .sort((a, b) => a.ranking - b.ranking)
        .map((r) => r.variant);
      const seen = new Set(ordered);
      const tail = DEFAULT_RANKING.filter((s) => !seen.has(s));
      this.ranking = [...ordered, ...tail];

      const topNotes = rows.find((r) => r.ranking === 1)?.notes ?? null;
      this.notes = topNotes ?? '';
      this.submitted = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Persist the current ranking + notes for `reviewerId`. Deletes any
   * prior rows for this reviewer first, then inserts six fresh rows
   * (one per variant). On success sets `submitted = true` and clears
   * `submitError`. On failure surfaces the message via `submitError`.
   */
  async submit(reviewerId: string): Promise<void> {
    this.submitting = true;
    this.submitError = null;
    try {
      const { error: delErr } = await supabase
        .from('variant_picks')
        .delete()
        .eq('reviewer_id', reviewerId);

      if (delErr) {
        throw new Error(delErr.message ?? 'failed to clear prior picks');
      }

      const trimmedNotes = this.notes.trim();
      const rows = this.ranking.map((variant, idx) => ({
        reviewer_id: reviewerId,
        variant,
        ranking: idx + 1,
        notes: idx === 0 && trimmedNotes ? trimmedNotes : null
      }));

      const { error: insErr } = await supabase.from('variant_picks').insert(rows);
      if (insErr) {
        throw new Error(insErr.message ?? 'failed to save picks');
      }

      this.submitted = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.submitError = message;
      throw err;
    } finally {
      this.submitting = false;
    }
  }

  /** Test-only: replace the ranking directly. */
  __setRankingForTests(next: VariantSlug[]): void {
    this.ranking = next;
  }
}

export function createPickStore(): PickStore {
  return new PickStore();
}
