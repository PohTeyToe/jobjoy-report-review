import { supabase } from '../supabase';
import type { VariantSlug } from '../variants';

export type AdminThreadComment = {
  id: string;
  pin_id: string;
  reviewer_id: string;
  reviewer_name?: string;
  body: string;
  created_at: string;
};

export type AdminPin = {
  id: string;
  variant: VariantSlug;
  page_index: number;
  x_pct: number;
  y_pct: number;
  reviewer_id: string;
  reviewer_name?: string;
  first_comment?: string;
  comment_count: number;
  resolved_at: string | null;
  created_at: string;
};

export type AdminPick = {
  id?: string;
  reviewer_id: string;
  reviewer_name?: string;
  variant: VariantSlug;
  ranking: number;
  notes: string | null;
  created_at: string;
};

interface PinJoinRow {
  id: string;
  variant: VariantSlug;
  page_index: number;
  x_pct: number;
  y_pct: number;
  reviewer_id: string;
  resolved_at: string | null;
  created_at: string;
  reviewers?: { name?: string } | null;
  comments?: Array<{
    id: string;
    body: string;
    created_at: string;
    reviewer_id: string;
  }> | null;
}

interface PickJoinRow {
  id?: string;
  reviewer_id: string;
  variant: VariantSlug;
  ranking: number;
  notes: string | null;
  created_at: string;
  reviewers?: { name?: string } | null;
}

export class AdminStore {
  allPins = $state<AdminPin[]>([]);
  allPicks = $state<AdminPick[]>([]);
  allComments = $state<Record<string, AdminThreadComment[]>>({});
  loading = $state(false);
  loadError = $state<string | null>(null);

  private channels: Array<{ unsub: () => void }> = [];
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;

  async loadAll(): Promise<void> {
    this.loading = true;
    this.loadError = null;
    try {
      const [pinsRes, picksRes] = await Promise.all([
        supabase
          .from('pins')
          .select(
            `id, variant, page_index, x_pct, y_pct, reviewer_id, resolved_at, created_at,
             reviewers ( name ),
             comments ( id, body, created_at, reviewer_id, reviewers ( name ) )`
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('variant_picks')
          .select(`id, reviewer_id, variant, ranking, notes, created_at, reviewers ( name )`)
          .order('created_at', { ascending: false })
      ]);

      if (pinsRes.error) {
        this.loadError = pinsRes.error.message;
      }
      if (picksRes.error) {
        this.loadError = (this.loadError ?? '') + ' ' + picksRes.error.message;
      }

      const pinRows: PinJoinRow[] = (pinsRes.data ?? []) as unknown as PinJoinRow[];
      const pickRows: PickJoinRow[] = (picksRes.data ?? []) as unknown as PickJoinRow[];

      const commentsByPin: Record<string, AdminThreadComment[]> = {};
      const pins: AdminPin[] = pinRows.map((r) => {
        const cs = (r.comments ?? [])
          .slice()
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        type CommentJoinRow = {
          id: string;
          body: string;
          created_at: string;
          reviewer_id: string;
          reviewers?: { name?: string } | null;
        };
        commentsByPin[r.id] = cs.map((c) => {
          const cc = c as CommentJoinRow;
          return {
            id: cc.id,
            pin_id: r.id,
            reviewer_id: cc.reviewer_id,
            reviewer_name: cc.reviewers?.name,
            body: cc.body,
            created_at: cc.created_at
          };
        });
        return {
          id: r.id,
          variant: r.variant,
          page_index: r.page_index,
          x_pct: r.x_pct,
          y_pct: r.y_pct,
          reviewer_id: r.reviewer_id,
          reviewer_name: r.reviewers?.name,
          first_comment: cs[0]?.body,
          comment_count: cs.length,
          resolved_at: r.resolved_at,
          created_at: r.created_at
        };
      });

      const picks: AdminPick[] = pickRows.map((r) => ({
        id: r.id,
        reviewer_id: r.reviewer_id,
        reviewer_name: r.reviewers?.name,
        variant: r.variant,
        ranking: r.ranking,
        notes: r.notes,
        created_at: r.created_at
      }));

      this.allPins = pins;
      this.allComments = commentsByPin;
      this.allPicks = picks;
    } catch (err) {
      this.loadError = err instanceof Error ? err.message : 'Failed to load admin data';
    } finally {
      this.loading = false;
    }
  }

  subscribeRealtime(): void {
    this.unsubscribeRealtime();
    const schema = 'design_review';
    const debouncedRefetch = () => {
      if (this.refetchTimer) clearTimeout(this.refetchTimer);
      this.refetchTimer = setTimeout(() => {
        this.refetchTimer = null;
        void this.loadAll();
      }, 250);
    };

    const tag = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`admin:${tag}`)
      .on('postgres_changes', { event: '*', schema, table: 'pins' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema, table: 'comments' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema, table: 'variant_picks' }, debouncedRefetch)
      .subscribe();

    this.channels.push({
      unsub: () => {
        void supabase.removeChannel(ch);
      }
    });
  }

  unsubscribeRealtime(): void {
    for (const c of this.channels) c.unsub();
    this.channels = [];
    if (this.refetchTimer) {
      clearTimeout(this.refetchTimer);
      this.refetchTimer = null;
    }
  }

  /** Test-only: seed pins directly without a network call. */
  __setPinsForTests(pins: AdminPin[]): void {
    this.allPins = pins;
  }
  __setPicksForTests(picks: AdminPick[]): void {
    this.allPicks = picks;
  }
  __setCommentsForTests(c: Record<string, AdminThreadComment[]>): void {
    this.allComments = c;
  }
}

export function createAdminStore(): AdminStore {
  return new AdminStore();
}

export type AdminFilters = {
  variants: VariantSlug[];
  reviewerIds: string[];
  resolved: 'all' | 'open' | 'resolved';
  dateFrom: string | null;
  dateTo: string | null;
};

export function defaultFilters(): AdminFilters {
  return {
    variants: [],
    reviewerIds: [],
    resolved: 'all',
    dateFrom: null,
    dateTo: null
  };
}

export function applyFilters(pins: AdminPin[], filters: AdminFilters): AdminPin[] {
  return pins.filter((p) => {
    if (filters.variants.length > 0 && !filters.variants.includes(p.variant)) return false;
    if (filters.reviewerIds.length > 0 && !filters.reviewerIds.includes(p.reviewer_id))
      return false;
    if (filters.resolved === 'open' && p.resolved_at) return false;
    if (filters.resolved === 'resolved' && !p.resolved_at) return false;
    if (filters.dateFrom && p.created_at < filters.dateFrom) return false;
    if (filters.dateTo && p.created_at > filters.dateTo) return false;
    return true;
  });
}
