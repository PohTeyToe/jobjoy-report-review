import { VARIANTS, type VariantSlug } from '../variants';
import type { AdminPin, AdminPick, AdminThreadComment } from './admin-store.svelte';

export type ExportInput = {
  pins: AdminPin[];
  comments: Record<string, AdminThreadComment[]>;
  picks: AdminPick[];
  exportedAt?: string;
};

function variantTitle(slug: VariantSlug): string {
  return VARIANTS.find((v) => v.slug === slug)?.title ?? slug;
}

/**
 * Pure markdown generator for the admin "Export feedback pack" button.
 * Deterministic output (sorted by variant order then created_at asc) so a
 * golden test can pin it.
 */
export function buildMarkdown(input: ExportInput): string {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const reviewerIds = new Set<string>();
  for (const p of input.pins) reviewerIds.add(p.reviewer_id);
  for (const p of input.picks) reviewerIds.add(p.reviewer_id);

  const open = input.pins.filter((p) => !p.resolved_at).length;
  const resolved = input.pins.length - open;

  const lines: string[] = [];
  lines.push('# JobJoy Sample 1 — Design Review Feedback Pack');
  lines.push(`Exported: ${exportedAt}`);
  lines.push(`Reviewers: ${reviewerIds.size}`);
  lines.push(`Pins: ${input.pins.length} (open: ${open}, resolved: ${resolved})`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const variantOrder = VARIANTS.map((v) => v.slug);
  const pinsByVariant = new Map<VariantSlug, AdminPin[]>();
  for (const p of input.pins) {
    const arr = pinsByVariant.get(p.variant) ?? [];
    arr.push(p);
    pinsByVariant.set(p.variant, arr);
  }

  let pinCounter = 0;
  for (const slug of variantOrder) {
    const variantPins = pinsByVariant.get(slug);
    if (!variantPins || variantPins.length === 0) continue;
    variantPins.sort((a, b) => a.created_at.localeCompare(b.created_at));

    lines.push(`## Variant — ${variantTitle(slug)}`);
    lines.push('');

    for (const pin of variantPins) {
      pinCounter++;
      lines.push(
        `### Pin ${pinCounter} · Page ${pin.page_index + 1} · ${pin.reviewer_name ?? '—'}`
      );
      lines.push(`Created: ${pin.created_at}`);
      lines.push(`Position: ${pin.x_pct.toFixed(1)}% from left, ${pin.y_pct.toFixed(1)}% from top`);
      const status = pin.resolved_at ? `Resolved ${pin.resolved_at}` : 'Open';
      lines.push(`Status: ${status}`);
      lines.push('');

      const thread = (input.comments[pin.id] ?? [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      for (const c of thread) {
        lines.push(`**${c.reviewer_name ?? '—'}** (${c.created_at}):`);
        lines.push(c.body);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  if (input.picks.length > 0) {
    lines.push('## Variant Picks');
    lines.push('');
    const sorted = [...input.picks].sort((a, b) => {
      const va = variantOrder.indexOf(a.variant);
      const vb = variantOrder.indexOf(b.variant);
      if (va !== vb) return va - vb;
      return a.ranking - b.ranking;
    });
    for (const pick of sorted) {
      const note = pick.notes && pick.notes.trim() ? pick.notes.trim() : '—';
      lines.push(
        `- **${variantTitle(pick.variant)}** (rank ${pick.ranking}, picked by ${pick.reviewer_name ?? '—'}): ${note}`
      );
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function exportFilename(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `jobjoy-feedback-${yyyy}-${mm}-${dd}.md`;
}
