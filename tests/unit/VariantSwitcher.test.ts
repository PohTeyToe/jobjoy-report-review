import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import VariantSwitcher from '../../src/lib/VariantSwitcher.svelte';
import { VARIANTS } from '../../src/lib/variants';

describe('VariantSwitcher', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => cleanup());

  it('renders one chip per variant in canonical order', () => {
    const { container } = render(VariantSwitcher, { props: { active: 'recommended' } });
    const chips = container.querySelectorAll('[data-testid="variant-chip"]');
    expect(chips.length).toBe(VARIANTS.length);
    Array.from(chips).forEach((chip, i) => {
      expect(chip.getAttribute('data-slug')).toBe(VARIANTS[i].slug);
    });
  });

  it('marks the active chip with data-active=true', () => {
    const { container } = render(VariantSwitcher, { props: { active: 'huashu' } });
    const chips = container.querySelectorAll('[data-testid="variant-chip"]');
    const active = Array.from(chips).filter((c) => c.getAttribute('data-active') === 'true');
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('data-slug')).toBe('huashu');
    expect(active[0].className).toMatch(/chip-active/);
  });

  it('dispatches variantchange on click', () => {
    const onvariantchange = vi.fn();
    const { container } = render(VariantSwitcher, {
      props: { active: 'recommended', onvariantchange }
    });
    const impeccableChip = container.querySelector(
      '[data-testid="variant-chip"][data-slug="impeccable"]'
    ) as HTMLButtonElement;
    impeccableChip.click();
    expect(onvariantchange).toHaveBeenCalledWith('impeccable');
  });

  it('does not re-dispatch when active chip is clicked', () => {
    const onvariantchange = vi.fn();
    const { container } = render(VariantSwitcher, {
      props: { active: 'recommended', onvariantchange }
    });
    const activeChip = container.querySelector(
      '[data-testid="variant-chip"][data-slug="recommended"]'
    ) as HTMLButtonElement;
    activeChip.click();
    expect(onvariantchange).not.toHaveBeenCalled();
  });

  it('keyboard shortcuts 1-6 select the corresponding variant', () => {
    const onvariantchange = vi.fn();
    render(VariantSwitcher, { props: { active: 'recommended', onvariantchange } });
    for (let i = 1; i <= 6; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: String(i) }));
    }
    const received = onvariantchange.mock.calls.map((c) => c[0]);
    // 2 ("recommended") is the active one and will be ignored; everything else fires.
    const expected = VARIANTS.map((v) => v.slug).filter((s) => s !== 'recommended');
    expect(received).toEqual(expected);
  });

  it('ignores keyboard shortcuts when focused in a text input', () => {
    const onvariantchange = vi.fn();
    render(VariantSwitcher, { props: { active: 'recommended', onvariantchange } });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '3', bubbles: true }));
    expect(onvariantchange).not.toHaveBeenCalled();
  });

  it('ignores keys outside 1-N range', () => {
    const onvariantchange = vi.fn();
    render(VariantSwitcher, { props: { active: 'recommended', onvariantchange } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(onvariantchange).not.toHaveBeenCalled();
  });
});
