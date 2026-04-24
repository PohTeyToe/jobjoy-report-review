/**
 * Compute click position as a percentage of the bounding box of a `.page` element.
 * Returned values are clamped to [0, 100]. Used by Phase 2 pin overlay to persist
 * resolution-independent coordinates.
 */
export type PagePct = { x_pct: number; y_pct: number };

export function clickToPct(event: { clientX: number; clientY: number }, pageEl: Element): PagePct {
  const rect = pageEl.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  const rawX = ((event.clientX - rect.left) / width) * 100;
  const rawY = ((event.clientY - rect.top) / height) * 100;
  return {
    x_pct: clamp(rawX, 0, 100),
    y_pct: clamp(rawY, 0, 100)
  };
}

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}
