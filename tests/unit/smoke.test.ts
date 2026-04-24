import { describe, expect, it } from 'vitest';
import { VARIANTS } from '../../src/lib/variants';

describe('variants catalog', () => {
  it('contains all six variant slugs in the canonical order', () => {
    expect(VARIANTS.map((v) => v.slug)).toEqual([
      'faithful',
      'recommended',
      'impeccable',
      'taste-frontend',
      'huashu',
      'baseline'
    ]);
  });

  it('every variant has a title, tagline, and accent colors', () => {
    for (const v of VARIANTS) {
      expect(v.title).toBeTruthy();
      expect(v.tagline).toBeTruthy();
      expect(v.accent).toMatch(/oklch/);
      expect(v.accentTo).toMatch(/oklch/);
    }
  });
});
