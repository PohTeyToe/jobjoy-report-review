import { describe, it, expect, beforeEach } from 'vitest';
import { findClosestPageToCenter, scrollToPageIndex } from '../../src/lib/page-sync';

type PageSpec = { top: number; height: number; index: number };

function buildPages(container: HTMLElement, pages: PageSpec[]): HTMLElement[] {
  while (container.firstChild) container.removeChild(container.firstChild);
  return pages.map((p) => {
    const el = document.createElement('div');
    el.className = 'page';
    el.setAttribute('data-page-index', String(p.index));
    el.getBoundingClientRect = () =>
      ({
        top: p.top,
        left: 0,
        right: 800,
        bottom: p.top + p.height,
        width: 800,
        height: p.height,
        x: 0,
        y: p.top,
        toJSON() {
          return this;
        }
      }) as DOMRect;
    el.scrollIntoView = () => {};
    container.appendChild(el);
    return el;
  });
}

describe('findClosestPageToCenter', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Fresh container each test; remove any prior container.
    document.body.replaceChildren();
    container = document.createElement('div');
    document.body.appendChild(container);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  it('returns 0 when there are no .page elements', () => {
    expect(findClosestPageToCenter(document)).toBe(0);
  });

  it('picks the page whose center-y is closest to viewport center', () => {
    // viewport center = 400
    buildPages(container, [
      { top: -1000, height: 900, index: 0 }, // center -550
      { top: 100, height: 600, index: 1 }, // center 400  <-- winner
      { top: 1000, height: 500, index: 2 } // center 1250
    ]);
    expect(findClosestPageToCenter(document)).toBe(1);
  });

  it('picks the first page when scrolled to top', () => {
    buildPages(container, [
      { top: 50, height: 800, index: 0 }, // center 450  <-- closest to 400
      { top: 900, height: 800, index: 1 },
      { top: 1800, height: 800, index: 2 }
    ]);
    expect(findClosestPageToCenter(document)).toBe(0);
  });

  it('picks the last page when scrolled to bottom', () => {
    buildPages(container, [
      { top: -1800, height: 800, index: 0 },
      { top: -900, height: 800, index: 1 },
      { top: 50, height: 800, index: 2 }
    ]);
    expect(findClosestPageToCenter(document)).toBe(2);
  });

  it('returns the data-page-index value, not positional index', () => {
    buildPages(container, [{ top: 100, height: 600, index: 42 }]);
    expect(findClosestPageToCenter(document)).toBe(42);
  });
});

describe('scrollToPageIndex', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('clamps to last page when requested index overshoots', () => {
    const pages = buildPages(container, [
      { top: 0, height: 100, index: 0 },
      { top: 100, height: 100, index: 1 }
    ]);
    let scrolled: HTMLElement | null = null;
    for (const p of pages) p.scrollIntoView = () => (scrolled = p);
    const landed = scrollToPageIndex(document, 99);
    expect(landed).toBe(1);
    expect(scrolled).toBe(pages[1]);
  });

  it('clamps negative requests to 0', () => {
    const pages = buildPages(container, [
      { top: 0, height: 100, index: 0 },
      { top: 100, height: 100, index: 1 }
    ]);
    let scrolled: HTMLElement | null = null;
    for (const p of pages) p.scrollIntoView = () => (scrolled = p);
    const landed = scrollToPageIndex(document, -5);
    expect(landed).toBe(0);
    expect(scrolled).toBe(pages[0]);
  });

  it('falls back to last page when requested data-page-index is missing', () => {
    // Pages exist at data-page-index 0, 2, 5 (skipped indices). Requesting
    // index 3 should not silently resolve to the positional 4th page — it
    // should clamp to the last page (data-page-index=5).
    const pages = buildPages(container, [
      { top: 0, height: 100, index: 0 },
      { top: 100, height: 100, index: 2 },
      { top: 200, height: 100, index: 5 }
    ]);
    let scrolled: HTMLElement | null = null;
    for (const p of pages) p.scrollIntoView = () => (scrolled = p);
    const landed = scrollToPageIndex(document, 3);
    expect(landed).toBe(pages.length - 1);
    expect(scrolled).toBe(pages[pages.length - 1]);
  });
});
