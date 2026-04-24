import { supabase } from './supabase';
import type { VariantSlug } from './variants';

export type Pin = {
  id: string;
  variant: VariantSlug;
  page_index: number;
  x_pct: number;
  y_pct: number;
  reviewer_id: string;
  reviewer_name?: string;
  first_comment?: string;
  resolved_at: string | null;
  created_at: string;
  isOptimistic?: boolean;
};

export type DropPinInput = {
  variant: VariantSlug;
  page_index: number;
  x_pct: number;
  y_pct: number;
  body: string;
  reviewer: { id: string; name: string };
};

export type FailedDrop = {
  tempId: string;
  input: DropPinInput;
  error: string;
};

function isoNow(): string {
  return new Date().toISOString();
}

function genTempId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `temp-${rand}`;
}

/**
 * Reactive store for the pin overlay. Owns:
 *   - the canonical list of pins for the active variant
 *   - the optimistic-insert lifecycle (temp id → real id, or rollback on err)
 *   - the failed-drop log for surfaced toasts
 *
 * Implemented as a class instance so each route can own its own state without
 * leaking globals into tests.
 */
interface PinRow {
  id: string;
  variant: VariantSlug;
  page_index: number;
  x_pct: number;
  y_pct: number;
  reviewer_id: string;
  resolved_at: string | null;
  created_at: string;
  reviewers?: { name?: string } | null;
  comments?: Array<{ body: string; created_at: string }> | null;
}

export class PinStore {
  pins = $state<Pin[]>([]);
  failed = $state<FailedDrop[]>([]);
  loading = $state(false);
  private activeVariant: VariantSlug | null = null;

  async loadPins(variant: VariantSlug): Promise<void> {
    this.activeVariant = variant;
    this.loading = true;
    try {
      // Pull pins + their first comment + reviewer name in one round-trip.
      // PostgREST resource-embedding: !inner forces the join to filter rows.
      const { data, error } = await supabase
        .from('pins')
        .select(
          `id, variant, page_index, x_pct, y_pct, reviewer_id, resolved_at, created_at,
           reviewers ( name ),
           comments ( body, created_at )`
        )
        .eq('variant', variant)
        .order('created_at', { ascending: true })
        .order('created_at', { ascending: true, foreignTable: 'comments' });

      if (error) {
        console.error('[pin-store] loadPins failed:', error);
        if (this.activeVariant === variant) this.pins = [];
        return;
      }

      // Bail if a newer loadPins started after we awaited.
      if (this.activeVariant !== variant) return;

      const rows: PinRow[] = (data ?? []) as PinRow[];

      this.pins = rows.map((r) => {
        // Server orders comments asc via the chained .order() above; the
        // client-side sort is a defensive fallback for older/cached payloads.
        const firstComment = (r.comments ?? [])
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
        return {
          id: r.id,
          variant: r.variant,
          page_index: r.page_index,
          x_pct: r.x_pct,
          y_pct: r.y_pct,
          reviewer_id: r.reviewer_id,
          reviewer_name: r.reviewers?.name,
          first_comment: firstComment?.body,
          resolved_at: r.resolved_at,
          created_at: r.created_at
        };
      });
    } finally {
      this.loading = false;
    }
  }

  /**
   * Optimistically append a temp pin, then persist asynchronously. Returns
   * the temp id so callers can correlate UI state if needed. The promise
   * resolves once the real row is in place (or rejects on failure).
   */
  async dropPin(input: DropPinInput): Promise<string> {
    const mySlug = input.variant;
    const tempId = genTempId();
    const tempPin: Pin = {
      id: tempId,
      variant: input.variant,
      page_index: input.page_index,
      x_pct: input.x_pct,
      y_pct: input.y_pct,
      reviewer_id: input.reviewer.id,
      reviewer_name: input.reviewer.name,
      first_comment: input.body,
      resolved_at: null,
      created_at: isoNow(),
      isOptimistic: true
    };
    // Note: we do NOT bail here even if `activeVariant` doesn't match —
    // a fresh PinStore that hasn't loaded yet has `activeVariant === null`,
    // and the post-await checks below are sufficient to guard against the
    // variant-switch race.
    this.pins = [...this.pins, tempPin];

    try {
      const { data: pinRow, error: pinErr } = await supabase
        .from('pins')
        .insert({
          variant: input.variant,
          page_index: input.page_index,
          x_pct: input.x_pct,
          y_pct: input.y_pct,
          reviewer_id: input.reviewer.id
        })
        .select('id, created_at')
        .single();

      if (pinErr || !pinRow) {
        throw new Error(pinErr?.message ?? 'pin insert failed');
      }

      const realId = pinRow.id as string;
      const createdAt = (pinRow.created_at as string) ?? isoNow();

      const { error: commentErr } = await supabase.from('comments').insert({
        pin_id: realId,
        reviewer_id: input.reviewer.id,
        body: input.body
      });

      if (commentErr) {
        // Roll back the orphaned pin row so we don't leave a zombie in DB.
        try {
          await supabase.from('pins').delete().eq('id', realId);
        } catch {
          // best-effort rollback
        }
        throw new Error(commentErr.message ?? 'comment insert failed');
      }

      if (this.activeVariant !== null && this.activeVariant !== mySlug) {
        // User has switched variants since we started; do not mutate the
        // visible pin list (it now belongs to a different variant). The row
        // still persisted server-side and will reappear on reload.
        return realId;
      }

      this.pins = this.pins.map((p) =>
        p.id === tempId ? { ...p, id: realId, created_at: createdAt, isOptimistic: false } : p
      );
      return realId;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      if (this.activeVariant === null || this.activeVariant === mySlug) {
        this.pins = this.pins.filter((p) => p.id !== tempId);
      }
      this.failed = [...this.failed, { tempId, input, error: message }];
      throw err;
    }
  }

  /** Test-only: replace the pin list directly. */
  __setPinsForTests(pins: Pin[]): void {
    this.pins = pins;
  }
}

/**
 * Factory so each route gets its own store instance. Tests construct their
 * own to avoid cross-test bleed.
 */
export function createPinStore(): PinStore {
  return new PinStore();
}
