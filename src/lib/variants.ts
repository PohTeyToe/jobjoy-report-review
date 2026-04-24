export type VariantSlug =
  | 'faithful'
  | 'recommended'
  | 'impeccable'
  | 'taste-frontend'
  | 'huashu'
  | 'baseline';

export type Variant = {
  slug: VariantSlug;
  title: string;
  tagline: string;
  accent: string;
  accentTo: string;
};

export const VARIANTS: Variant[] = [
  {
    slug: 'faithful',
    title: 'Faithful',
    tagline: "Closest rendering of George's original spec.",
    accent: 'oklch(0.55 0.18 50)',
    accentTo: 'oklch(0.72 0.14 80)'
  },
  {
    slug: 'recommended',
    title: 'Recommended',
    tagline: 'Strongest all-round — balanced typography, hierarchy, tone.',
    accent: 'oklch(0.45 0.18 260)',
    accentTo: 'oklch(0.62 0.2 290)'
  },
  {
    slug: 'impeccable',
    title: 'Impeccable',
    tagline: 'Editorial polish, fine typographic detailing.',
    accent: 'oklch(0.25 0.05 30)',
    accentTo: 'oklch(0.55 0.08 60)'
  },
  {
    slug: 'taste-frontend',
    title: 'Taste Frontend',
    tagline: 'Opinionated modern aesthetic, strong accent.',
    accent: 'oklch(0.6 0.22 25)',
    accentTo: 'oklch(0.75 0.18 55)'
  },
  {
    slug: 'huashu',
    title: 'Huashu',
    tagline: 'High-design exploration, bolder visual language.',
    accent: 'oklch(0.35 0.18 310)',
    accentTo: 'oklch(0.6 0.22 340)'
  },
  {
    slug: 'baseline',
    title: 'Baseline',
    tagline: 'Minimal reference against which the others are measured.',
    accent: 'oklch(0.6 0.02 260)',
    accentTo: 'oklch(0.85 0.01 260)'
  }
];
