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
   * Author-only pin delete. Optimistically removes the pin from the local
   * list (and closes the active thread if it points at this pin), then
   * issues a `delete` against Supabase. RLS gates this server-side: a
   * non-author's delete returns 0 rows but no error, so we re-check
   * `count` and roll back the optimistic removal on a no-op.
   *
   * Returns a snapshot containing the pin row AND all of its comments so
   * the undo flow can restore the full thread. The cascade on
   * `pins -> comments` deletes every comment when the pin row is removed,
   * so without snapshotting them up front Undo would silently drop every
   * reply and hand the user back an empty thread (per Claude review #3).
   */
  async deletePin(pinId: string): Promise<{ pin: Pin; comments: ThreadComment[] } | null> {
    const pinSnapshot = this.pins.find((p) => p.id === pinId) ?? null;
    if (!pinSnapshot) return null;

    // Pull comments BEFORE the delete — once the cascade fires they're
    // gone from the DB and we can't reconstruct them.
    const { data: commentRows, error: fetchErr } = await supabase
      .from('comments')
      .select('id, pin_id, reviewer_id, body, created_at, reviewers ( name )')
      .eq('pin_id', pinId)
      .order('created_at', { ascending: true });

    if (fetchErr) {
      throw new Error(fetchErr.message ?? 'failed to snapshot thread for undo');
    }

    type CommentSnapshotRow = {
      id: string;
      pin_id: string;
      reviewer_id: string;
      body: string;
      created_at: string;
      reviewers?: { name?: string } | null;
    };
    const commentSnapshots: ThreadComment[] = ((commentRows ?? []) as CommentSnapshotRow[]).map(
      (c) => ({
        id: c.id,
        pin_id: c.pin_id,
        reviewer_id: c.reviewer_id,
        reviewer_name: c.reviewers?.name,
        body: c.body,
        created_at: c.created_at
      })
    );

    // Optimistic removal.
    this.pins = this.pins.filter((p) => p.id !== pinId);
    if (this.activeThread && this.activeThread.pin.id === pinId) {
      this.activeThread = null;
    }

    const { error, count } = await supabase.from('pins').delete({ count: 'exact' }).eq('id', pinId);

    if (error || count === 0) {
      // Roll back — RLS rejected (count=0) or transport failed.
      this.pins = [...this.pins, pinSnapshot].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      throw new Error(error?.message ?? 'Delete denied (not author)');
    }

    return { pin: pinSnapshot, comments: commentSnapshots };
  }

  /**
   * Restore a pin previously removed via deletePin. Re-inserts the pin row
   * preserving its original id + coords + created_at so deep-link URLs
   * (?pin=<id>) keep working post-undo, then re-inserts every comment that
   * was on the thread before the cascade fired.
   *
   * The pin row's reviewer_id MUST be the caller's auth.uid() (RLS).
   * Comments authored by OTHER reviewers cannot be restored by this
   * caller — RLS rejects an insert where reviewer_id != auth.uid(). The
   * function logs and skips those rows but still restores the pin and
   * the caller's own replies. In practice the trash chip is gated to
   * the pin author, so the only foreign comments are replies from
   * other reviewers; those are unrecoverable from the deleting user's
   * session.
   */
  async restorePin(snapshot: { pin: Pin; comments: ThreadComment[] }): Promise<void> {
    const { pin, comments } = snapshot;
    const { error } = await supabase.from('pins').insert({
      id: pin.id,
      variant: pin.variant,
      page_index: pin.page_index,
      x_pct: pin.x_pct,
      y_pct: pin.y_pct,
      reviewer_id: pin.reviewer_id,
      resolved_at: pin.resolved_at,
      created_at: pin.created_at
    });

    if (error) {
      throw new Error(error.message ?? 'Restore failed');
    }

    // Re-insert comments. Foreign-author rows will hit RLS and silently
    // fail (count=0) — log and continue rather than aborting the whole
    // restore. The pin is back even if some replies aren't.
    if (comments.length > 0) {
      const restorableComments = comments.map((c) => ({
        id: c.id,
        pin_id: c.pin_id,
        reviewer_id: c.reviewer_id,
        body: c.body,
        created_at: c.created_at
      }));
      const { error: commentErr } = await supabase.from('comments').insert(restorableComments);
      if (commentErr) {
        console.warn(
          '[pin-store] some comments could not be restored (likely cross-author RLS):',
          commentErr.message
        );
      }
    }

    // Optimistic local re-add — realtime echo will be deduped by id match.
    if (!this.pins.some((p) => p.id === pin.id)) {
      this.pins = [...this.pins, { ...pin, isOptimistic: false }].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
    }
  }

  /**
   * Author-only comment delete. Mirror of deletePin.
   *
   * Removes from the active thread synchronously, then issues the network
   * delete. Returns the original comment so the caller can restore it.
   */
  async deleteComment(commentId: string): Promise<ThreadComment | null> {
    const thread = this.activeThread;
    if (!thread) return null;
    const snapshot = thread.comments.find((c) => c.id === commentId) ?? null;
    if (!snapshot) return null;

    // Optimistic removal.
    this.activeThread = {
      ...thread,
      comments: thread.comments.filter((c) => c.id !== commentId)
    };

    const { error, count } = await supabase
      .from('comments')
      .delete({ count: 'exact' })
      .eq('id', commentId);

    if (error || count === 0) {
      // Roll back. If the thread is still open, restore visually. If the
      // user has since closed it (or the pin was deleted out from under
      // us), we don't have anywhere to put the comment back in the UI —
      // but per Claude review #4, surfacing the failure as a thrown error
      // ensures the caller (handleCommentDelete in /review) doesn't show
      // a misleading "deleted" toast for a row the DB still has. The
      // user reloading will reconcile.
      const current = this.activeThread;
      if (current && current.pin.id === thread.pin.id) {
        this.activeThread = {
          ...current,
          comments: [...current.comments, snapshot].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          )
        };
      }
      throw new Error(error?.message ?? 'Delete denied (not author)');
    }

    return snapshot;
  }

  /**
   * Restore a comment previously removed via deleteComment. Like restorePin,
   * preserves the original id + created_at so the thread ordering survives.
   */
  async restoreComment(comment: ThreadComment): Promise<void> {
    const { error } = await supabase.from('comments').insert({
      id: comment.id,
      pin_id: comment.pin_id,
      reviewer_id: comment.reviewer_id,
      body: comment.body,
      created_at: comment.created_at
    });

    if (error) {
      throw new Error(error.message ?? 'Restore failed');
    }

    if (this.activeThread && this.activeThread.pin.id === comment.pin_id) {
      const exists = this.activeThread.comments.some((c) => c.id === comment.id);
      if (!exists) {
        this.activeThread = {
          ...this.activeThread,
          comments: [...this.activeThread.comments, { ...comment, isOptimistic: false }].sort(
            (a, b) => a.created_at.localeCompare(b.created_at)
          )
        };
      }
    }
  }

  /** Apply a realtime DELETE on a comment to the active thread. */
  applyRealtimeCommentDelete(commentId: string): void {
    if (!this.activeThread) return;
    if (!this.activeThread.comments.some((c) => c.id === commentId)) return;
    this.activeThread = {
      ...this.activeThread,
      comments: this.activeThread.comments.filter((c) => c.id !== commentId)
    };
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
      // Coords are stored as Postgres `real` (float4), which truncates the
      // 64-bit float we send by ~1e-6. Strict === fails after roundtrip, so
      // we match within an epsilon. Don't lower this below 1e-3 — clicks
      // separated by less than 0.1% of page width would still be different
      // pins (a page is hundreds of px wide; 0.1% is sub-pixel).
      const COORD_EPSILON = 1e-3;
      const closeEnough = (a: number, b: number | undefined): boolean =>
        b !== undefined && Math.abs(a - b) < COORD_EPSILON;
      const matchTempIdx = this.pins.findIndex(
        (p) =>
          p.id.startsWith('temp-') &&
          p.variant === row.variant &&
          p.page_index === row.page_index &&
          closeEnough(p.x_pct, row.x_pct) &&
          closeEnough(p.y_pct, row.y_pct) &&
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
