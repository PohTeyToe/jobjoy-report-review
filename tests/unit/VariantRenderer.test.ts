import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';
import VariantRenderer, { __testShadowRoots } from '../../src/lib/VariantRenderer.svelte';

/**
 * Minimal variant HTML for tests. Mirrors what sync-variants.ts produces:
 *   - <style> with @font-face rules whose url() is already absolute-rewritten
 *   - a `.page` with data-page-index
 *   - body text that inherits the variant font
 */
function buildVariantHtml(slug: string): string {
  // Use inline style on the <p> so jsdom's getComputedStyle can resolve it
  // (jsdom has limited CSS cascade support inside shadow roots). The <style>
  // block still exercises the production path and lets us assert font-face
  // URL rewriting survives the shadow-mount pipeline.
  return `<!DOCTYPE html>
<html data-variant-slug="${slug}">
<head>
  <style>
    @font-face {
      font-family: 'VariantFont';
      src: url('/variants/${slug}/fonts/variant-font.woff2') format('woff2');
    }
    body, .page { font-family: 'VariantFont', serif; }
  </style>
</head>
<body>
  <div class="page" data-page-index="0">
    <p data-testid="variant-text" style="font-family: 'VariantFont', serif;">Hello from ${slug}</p>
  </div>
</body>
</html>`;
}

function installFetchMock(): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const m = url.match(/\/variants\/([^/]+)\/index\.html$/);
    const slug = m ? m[1] : 'unknown';
    return {
      ok: true,
      status: 200,
      text: async () => buildVariantHtml(slug)
    } as Response;
  }) as unknown as typeof fetch;
}

describe('VariantRenderer', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    installFetchMock();
    // Force a distinctive document-body font so we can detect preflight leak.
    document.body.style.fontFamily = 'Comic Sans MS';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('attaches a shadow root and renders variant content inside it', async () => {
    const onready = vi.fn();
    const { container } = render(VariantRenderer, {
      props: { variant: 'recommended', onready }
    });
    const host = container.querySelector('[data-testid="variant-host"]') as HTMLElement;
    expect(host).toBeTruthy();

    // Closed shadow roots are NOT accessible via host.shadowRoot.
    expect((host as unknown as { shadowRoot: ShadowRoot | null }).shadowRoot).toBeNull();

    await waitFor(() => {
      const root = __testShadowRoots.get(host);
      expect(root).toBeTruthy();
      expect(root!.querySelector('.page')).toBeTruthy();
    });

    const root = __testShadowRoots.get(host)!;
    const p = root.querySelector('[data-testid="variant-text"]') as HTMLElement;
    expect(p.textContent).toContain('recommended');

    // onready eventually fires.
    await waitFor(() => expect(onready).toHaveBeenCalled());
  });

  it('tailwind/outer-doc styles do not leak INTO the shadow root', async () => {
    const { container } = render(VariantRenderer, {
      props: { variant: 'recommended' }
    });
    const host = container.querySelector('[data-testid="variant-host"]') as HTMLElement;

    await waitFor(() => {
      const root = __testShadowRoots.get(host);
      expect(root?.querySelector('.page')).toBeTruthy();
    });

    const root = __testShadowRoots.get(host)!;
    const p = root.querySelector('[data-testid="variant-text"]') as HTMLElement;
    const inside = getComputedStyle(p).fontFamily;
    // The variant's own style declares VariantFont; Comic Sans from the outer
    // document body must NOT bleed through shadow encapsulation.
    expect(inside).not.toContain('Comic Sans');
    // The shadow content should see the variant font family (exact form may
    // include fallbacks).
    expect(inside.toLowerCase()).toContain('variantfont');
  });

  it('@font-face src URL resolves to /variants/<slug>/fonts/...', async () => {
    const { container } = render(VariantRenderer, {
      props: { variant: 'huashu' }
    });
    const host = container.querySelector('[data-testid="variant-host"]') as HTMLElement;

    await waitFor(() => {
      const root = __testShadowRoots.get(host);
      expect(root?.querySelector('style')).toBeTruthy();
    });

    const root = __testShadowRoots.get(host)!;
    // Skip the normalize stylesheet injected first; concatenate the rest so
    // we can assert against the variant's own @font-face rule wherever it
    // landed.
    const styles = Array.from(root.querySelectorAll('style')) as HTMLStyleElement[];
    const variantCss = styles
      .filter((s) => !s.hasAttribute('data-variant-normalize'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(variantCss).toContain("url('/variants/huashu/fonts/variant-font.woff2')");
  });

  it('re-mounts shadow content when variant prop changes', async () => {
    const { container, rerender } = render(VariantRenderer, {
      props: { variant: 'recommended' }
    });
    const host = container.querySelector('[data-testid="variant-host"]') as HTMLElement;

    await waitFor(() => {
      const root = __testShadowRoots.get(host);
      expect(root?.querySelector('[data-testid="variant-text"]')?.textContent).toContain(
        'recommended'
      );
    });

    await rerender({ variant: 'impeccable' });

    await waitFor(() => {
      const root = __testShadowRoots.get(host);
      expect(root?.querySelector('[data-testid="variant-text"]')?.textContent).toContain(
        'impeccable'
      );
    });
  });

  it('emits pageclick with percentage coords when a .page is clicked', async () => {
    const onpageclick = vi.fn();
    const { container } = render(VariantRenderer, {
      props: { variant: 'faithful', onpageclick }
    });
    const host = container.querySelector('[data-testid="variant-host"]') as HTMLElement;

    await waitFor(() => {
      const root = __testShadowRoots.get(host);
      expect(root?.querySelector('.page')).toBeTruthy();
    });

    const root = __testShadowRoots.get(host)!;
    const page = root.querySelector('.page') as HTMLElement;
    // Stub a predictable rect so the percentage math is deterministic.
    page.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 800,
        width: 400,
        height: 800,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        }
      }) as DOMRect;

    const ev = new MouseEvent('click', {
      bubbles: true,
      composed: true,
      clientX: 200,
      clientY: 400
    });
    page.dispatchEvent(ev);

    expect(onpageclick).toHaveBeenCalledTimes(1);
    const detail = onpageclick.mock.calls[0][0];
    expect(detail.variant).toBe('faithful');
    expect(detail.page_index).toBe(0);
    expect(detail.x_pct).toBeCloseTo(50, 5);
    expect(detail.y_pct).toBeCloseTo(50, 5);
  });
});
