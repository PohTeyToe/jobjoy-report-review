/**
 * Page-index sync utilities for keeping scroll position stable across variant swaps.
 */

export function findClosestPageToCenter(root: DocumentFragment | ShadowRoot | Document): number {
  const pages = Array.from(root.querySelectorAll('.page')) as HTMLElement[];
  if (pages.length === 0) return 0;
  const viewportCenter = window.innerHeight / 2;

  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];
    const rect = el.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const dist = Math.abs(center - viewportCenter);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  // Prefer the element's data-page-index attribute when present, otherwise fall
  // back to positional index.
  const attr = pages[bestIdx].getAttribute('data-page-index');
  const parsed = attr === null ? NaN : Number.parseInt(attr, 10);
  return Number.isFinite(parsed) ? parsed : bestIdx;
}

export function scrollToPageIndex(
  root: DocumentFragment | ShadowRoot | Document,
  pageIndex: number
): number {
  const pages = Array.from(root.querySelectorAll('.page')) as HTMLElement[];
  if (pages.length === 0) return 0;
  const clamped = Math.min(Math.max(pageIndex, 0), pages.length - 1);
  const target =
    (pages.find((p) => p.getAttribute('data-page-index') === String(clamped)) as HTMLElement) ??
    pages[clamped];
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  return clamped;
}
