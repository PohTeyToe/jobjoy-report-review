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

export type ThreadComment = {
  id: string;
  pin_id: string;
  reviewer_id: string;
  reviewer_name?: string;
  body: string;
  created_at: string;
  isOptimistic?: boolean;
};

export type Thread = {
  pin: Pin;
  comments: ThreadComment[];
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
  activeThread = $state<Thread | null>(null);
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

  /**
   * Fetch a single pin + its comments + reviewer names. Sets `activeThread`
   * to the result and also returns it so callers can branch on it.
   */
  async loadThread(pinId: string): Promise<Thread | null> {
    const { data, error } = await supabase
      .from('pins')
      .select(
        `id, variant, page_index, x_pct, y_pct, reviewer_id, resolved_at, created_at,
         reviewers ( name ),
         comments ( id, pin_id, reviewer_id, body, created_at,
                    reviewers ( name ) )`
      )
      .eq('id', pinId)
      .order('created_at', { ascending: true, foreignTable: 'comments' })
      .single();

    if (error || !data) {
      console.error('[pin-store] loadThread failed:', error);
      this.activeThread = null;
      return null;
    }

    type ThreadCommentRow = {
      id: string;
      pin_id: string;
      reviewer_id: string;
      body: string;
      created_at: string;
      reviewers?: { name?: string } | null;
    };
    const row = data as Omit<PinRow, 'comments'> & {
      comments?: ThreadCommentRow[] | null;
    };

    const pin: Pin = {
      id: row.id,
      variant: row.variant,
      page_index: row.page_index,
      x_pct: row.x_pct,
      y_pct: row.y_pct,
      reviewer_id: row.reviewer_id,
      reviewer_name: row.reviewers?.name,
      resolved_at: row.resolved_at,
      created_at: row.created_at
    };

    const comments: ThreadComment[] = (row.comments ?? []).map((c) => ({
      id: c.id,
      pin_id: c.pin_id,
      reviewer_id: c.reviewer_id,
      reviewer_name: c.reviewers?.name,
      body: c.body,
      created_at: c.created_at
    }));

    const thread: Thread = { pin, comments };
    this.activeThread = thread;
    return thread;
  }

  /**
   * Optimistically append a reply, then persist. On the active thread only.
   * If the thread is closed before the network round-trip resolves, the
   * server-side row will surface via the realtime subscription instead.
   */
  async addComment(
    pinId: string,
    body: string,
    reviewer: { id: string; name: string }
  ): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) return;

    const tempId = genTempId();
    const optimistic: ThreadComment = {
      id: tempId,
      pin_id: pinId,
      reviewer_id: reviewer.id,
      reviewer_name: reviewer.name,
      body: trimmed,
      created_at: isoNow(),
      isOptimistic: true
    };

    if (this.activeThread && this.activeThread.pin.id === pinId) {
      this.activeThread = {
        ...this.activeThread,
        comments: [...this.activeThread.comments, optimistic]
      };
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({ pin_id: pinId, reviewer_id: reviewer.id, body: trimmed })
      .select('id, pin_id, reviewer_id, body, created_at')
      .single();

    if (error || !data) {
      // Rollback the optimistic comment.
      if (this.activeThread && this.activeThread.pin.id === pinId) {
        this.activeThread = {
          ...this.activeThread,
          comments: this.activeThread.comments.filter((c) => c.id !== tempId)
        };
      }
      throw new Error(error?.message ?? 'comment insert failed');
    }

    if (this.activeThread && this.activeThread.pin.id === pinId) {
      this.activeThread = {
        ...this.activeThread,
        comments: this.activeThread.comments.map((c) =>
          c.id === tempId
            ? {
                ...c,
                id: (data as { id: string }).id,
                created_at: (data as { created_at: string }).created_at,
                isOptimistic: false
              }
            : c
        )
      };
    }
  }

  /**
   * Toggle pins.resolved_at between now() and null. Updates both the pin in
   * the variant list and (if open) the active thread, so the UI flips
   * synchronously without waiting for realtime.
   */
  async toggleResolved(pinId: string): Promise<void> {
    const current = this.pins.find((p) => p.id === pinId) ?? this.activeThread?.pin ?? null;
    if (!current) return;

    const nextResolved = current.resolved_at ? null : isoNow();

    // Optimistic UI flip first.
    this.pins = this.pins.map((p) => (p.id === pinId ? { ...p, resolved_at: nextResolved } : p));
    if (this.activeThread && this.activeThread.pin.id === pinId) {
      this.activeThread = {
        ...this.activeThread,
        pin: { ...this.activeThread.pin, resolved_at: nextResolved }
      };
    }

    const { error } = await supabase
      .from('pins')
      .update({ resolved_at: nextResolved })
      .eq('id', pinId);

    if (error) {
      // Roll back.
      this.pins = this.pins.map((p) =>
        p.id === pinId ? { ...p, resolved_at: current.resolved_at } : p
      );
      if (this.activeThread && this.activeThread.pin.id === pinId) {
        this.activeThread = {
          ...this.activeThread,
          pin: { ...this.activeThread.pin, resolved_at: current.resolved_at }
        };
      }
      throw new Error(error.message ?? 'resolve toggle failed');
    }
  }

  /**
   * Apply a realtime pin event to the local list. Idempotent: an INSERT for
   * a pin that already exists (because our optimistic write echoed back) is
   * a no-op.
   */
  applyRealtimePin(type: 'INSERT' | 'UPDATE' | 'DELETE', row: { id: string } & Partial<Pin>): void {
    if (type === 'DELETE') {
      this.pins = this.pins.filter((p) => p.id !== row.id);
      return;
    }
    const existing = this.pins.find((p) => p.id === row.id);
    if (existing) {
      this.pins = this.pins.map((p) =>
        p.id === row.id ? { ...p, ...row, isOptimistic: false } : p
      );
      if (this.activeThread && this.activeThread.pin.id === row.id) {
        this.activeThread = {
          ...this.activeThread,
          pin: { ...this.activeThread.pin, ...row }
        };
      }
      return;
    }
    if (type === 'INSERT' && row.variant && row.variant === this.activeVariant) {
      // Dedup: if realtime echo arrives before our dropPin INSERT response, swap temp id in place (else {#each} key set duplicates and crashes).
      // Coord match relies on Postgres float8 preserving IEEE 754 round-trip; if we ever round coords, switch to an epsilon compare.
      const matchTempIdx = this.pins.findIndex(
        (p) =>
          p.id.startsWith('temp-') &&
          p.variant === row.variant &&
          p.page_index === row.page_index &&
          p.x_pct === row.x_pct &&
          p.y_pct === row.y_pct &&
          p.reviewer_id === row.reviewer_id
      );
      if (matchTempIdx !== -1) {
        this.pins = this.pins.map((p, i) =>
          i === matchTempIdx
            ? {
                ...p,
                id: row.id,
                created_at: row.created_at ?? p.created_at,
                resolved_at: row.resolved_at ?? p.resolved_at,
                isOptimistic: false
              }
            : p
        );
        return;
      }
      // Build a Pin from the partial row. reviewer_name will fill in on the
      // next loadPins; for the realtime echo we accept the missing label.
      const pin: Pin = {
        id: row.id,
        variant: row.variant as VariantSlug,
        page_index: row.page_index ?? 0,
        x_pct: row.x_pct ?? 0,
        y_pct: row.y_pct ?? 0,
        reviewer_id: row.reviewer_id ?? '',
        resolved_at: row.resolved_at ?? null,
        created_at: row.created_at ?? isoNow()
      };
      this.pins = [...this.pins, pin];
    }
  }

  /** Append a realtime comment to the active thread, dedup by id. */
  applyRealtimeComment(comment: ThreadComment): void {
    if (!this.activeThread || this.activeThread.pin.id !== comment.pin_id) return;
    if (this.activeThread.comments.some((c) => c.id === comment.id)) return;
    this.activeThread = {
      ...this.activeThread,
      comments: [...this.activeThread.comments, comment]
    };
  }

  clearThread(): void {
    this.activeThread = null;
  }

  /** Test-only: replace the pin list directly. */
  __setPinsForTests(pins: Pin[]): void {
    this.pins = pins;
  }

  /** Test-only: set active variant without a network call. */
  __setActiveVariantForTests(variant: VariantSlug | null): void {
    this.activeVariant = variant;
  }

  /** Test-only: set active thread directly. */
  __setActiveThreadForTests(thread: Thread | null): void {
    this.activeThread = thread;
  }
}

/**
 * Factory so each route gets its own store instance. Tests construct their
 * own to avoid cross-test bleed.
 */
export function createPinStore(): PinStore {
  return new PinStore();
}
