import { describe, it, expect } from 'vitest';
import { clickToPct } from '../../src/lib/coord-math';

function makePageEl(rect: { left: number; top: number; width: number; height: number }): Element {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return this;
      }
    }) as DOMRect;
  return el;
}

describe('clickToPct', () => {
  const page = makePageEl({ left: 100, top: 200, width: 800, height: 1000 });

  it('top-left corner -> (0, 0)', () => {
    expect(clickToPct({ clientX: 100, clientY: 200 }, page)).toEqual({ x_pct: 0, y_pct: 0 });
  });

  it('bottom-right corner -> (100, 100)', () => {
    expect(clickToPct({ clientX: 900, clientY: 1200 }, page)).toEqual({ x_pct: 100, y_pct: 100 });
  });

  it('center -> (50, 50)', () => {
    expect(clickToPct({ clientX: 500, clientY: 700 }, page)).toEqual({ x_pct: 50, y_pct: 50 });
  });

  it('top-right edge -> (100, 0)', () => {
    expect(clickToPct({ clientX: 900, clientY: 200 }, page)).toEqual({ x_pct: 100, y_pct: 0 });
  });

  it('bottom-left edge -> (0, 100)', () => {
    expect(clickToPct({ clientX: 100, clientY: 1200 }, page)).toEqual({ x_pct: 0, y_pct: 100 });
  });

  it('clamps out-of-bounds clicks above/left', () => {
    expect(clickToPct({ clientX: 0, clientY: 0 }, page)).toEqual({ x_pct: 0, y_pct: 0 });
  });

  it('clamps out-of-bounds clicks past right/bottom', () => {
    expect(clickToPct({ clientX: 10000, clientY: 10000 }, page)).toEqual({
      x_pct: 100,
      y_pct: 100
    });
  });

  it('round-trips: pct -> absolute -> pct', () => {
    const targets = [
      { x_pct: 12.5, y_pct: 87.5 },
      { x_pct: 33.33, y_pct: 66.66 },
      { x_pct: 50, y_pct: 50 }
    ];
    for (const t of targets) {
      const clientX = 100 + (t.x_pct / 100) * 800;
      const clientY = 200 + (t.y_pct / 100) * 1000;
      const r = clickToPct({ clientX, clientY }, page);
      expect(r.x_pct).toBeCloseTo(t.x_pct, 6);
      expect(r.y_pct).toBeCloseTo(t.y_pct, 6);
    }
  });

  it('handles zero-size elements without returning NaN', () => {
    const zero = makePageEl({ left: 0, top: 0, width: 0, height: 0 });
    const r = clickToPct({ clientX: 10, clientY: 10 }, zero);
    expect(Number.isFinite(r.x_pct)).toBe(true);
    expect(Number.isFinite(r.y_pct)).toBe(true);
  });
});
