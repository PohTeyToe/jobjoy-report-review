<script lang="ts" module>
  /**
   * Test-only registry mapping host elements to their (closed) shadow roots.
   * In production the shadow root is inaccessible from outside — this map is
   * populated only to support component tests that need to introspect the
   * rendered DOM. Runtime code never reads this.
   */
  export const __testShadowRoots = new WeakMap<Element, ShadowRoot>();
</script>

<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { VariantSlug } from './variants';
  import { clickToPct } from './coord-math';
  import normalizeCss from './variant-normalize.css?raw';

  type Props = {
    variant: VariantSlug;
    onready?: (detail: { pageCount: number }) => void;
    onpageclick?: (detail: {
      variant: VariantSlug;
      page_index: number;
      x_pct: number;
      y_pct: number;
    }) => void;
  };

  const { variant, onready, onpageclick }: Props = $props();

  let host: HTMLDivElement | undefined = $state();
  let shadow: ShadowRoot | null = null;
  let lastLoaded: VariantSlug | null = null;
  let clickHandler: ((ev: Event) => void) | null = null;
  // Monotonic counter used to cancel superseded mount() calls when the user
  // switches variants faster than fetch/fonts.ready can resolve.
  let mountGen = 0;

  export function getShadow(): ShadowRoot | null {
    return shadow;
  }

  async function mount(slug: VariantSlug): Promise<void> {
    const gen = ++mountGen;
    if (!host) return;

    // Attach (or re-attach) a CLOSED shadow root. attachShadow can only be
    // called once per host, so on subsequent variant swaps we reuse the
    // existing root and just wipe its contents.
    if (!shadow) {
      shadow = host.attachShadow({ mode: 'closed' });
      __testShadowRoots.set(host, shadow);
    } else {
      // Detach any previous click listener before clearing content
      if (clickHandler) shadow.removeEventListener('click', clickHandler, true);
      while (shadow.firstChild) shadow.removeChild(shadow.firstChild);
    }

    const res = await fetch(`/variants/${slug}/index.html`);
    if (!res.ok) {
      throw new Error(`Failed to fetch variant ${slug}: ${res.status}`);
    }
    if (gen !== mountGen) return;
    const html = await res.text();
    if (gen !== mountGen) return;
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Inject normalization stylesheet FIRST so each variant's own styles
    // cascade on top — anything we set here is a low-specificity baseline
    // (resets, max-widths, prefers-reduced-motion) that variant rules can
    // override at will.
    const normalize = document.createElement('style');
    normalize.setAttribute('data-variant-normalize', 'true');
    normalize.textContent = normalizeCss;
    shadow!.appendChild(normalize);

    // Pull in <style> tags from <head> (and anywhere else).
    const styles = doc.querySelectorAll('style');
    styles.forEach((s) => {
      const clone = document.createElement('style');
      // copy attributes (e.g. data-inlined-from)
      for (const { name, value } of Array.from(s.attributes)) clone.setAttribute(name, value);
      clone.textContent = s.textContent ?? '';
      shadow!.appendChild(clone);
    });

    // Pull in remaining stylesheet links.
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    links.forEach((l) => {
      const clone = document.createElement('link');
      for (const { name, value } of Array.from(l.attributes)) clone.setAttribute(name, value);
      shadow!.appendChild(clone);
    });

    // Append body children. Stamp `data-variant-slug` on each `.page` so the
    // normalize stylesheet can apply targeted fixes per variant without
    // editing the upstream variant HTML (which gets blown away on next sync).
    const body = doc.body;
    if (body) {
      Array.from(body.childNodes).forEach((node) => {
        const cloned = node.cloneNode(true);
        if (cloned instanceof Element) {
          if (cloned.classList?.contains('page')) {
            cloned.setAttribute('data-variant-slug', slug);
          }
          cloned.querySelectorAll?.('.page').forEach((p) => {
            p.setAttribute('data-variant-slug', slug);
          });
        }
        shadow!.appendChild(cloned);
      });
    }

    // Capture-phase listener so clicks on anything inside .page are caught
    // before any in-variant handlers can stop them.
    clickHandler = (ev: Event) => {
      const e = ev as MouseEvent;
      const path = e.composedPath();
      const pageEl = path.find(
        (n) => n instanceof Element && (n as Element).classList?.contains('page')
      ) as HTMLElement | undefined;
      if (!pageEl) return;
      const { x_pct, y_pct } = clickToPct(e, pageEl);
      const attr = pageEl.getAttribute('data-page-index');
      const idx = attr === null ? 0 : Number.parseInt(attr, 10);
      onpageclick?.({
        variant,
        page_index: Number.isFinite(idx) ? idx : 0,
        x_pct,
        y_pct
      });
    };
    shadow.addEventListener('click', clickHandler, true);

    lastLoaded = slug;

    // Wait for fonts to settle before announcing ready.
    try {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }
    } catch {
      // ignore — not all test envs implement document.fonts
    }
    if (gen !== mountGen) return;
    const pageCount = shadow!.querySelectorAll('.page').length;
    onready?.({ pageCount });
  }

  onDestroy(() => {
    if (shadow && clickHandler) {
      shadow.removeEventListener('click', clickHandler, true);
    }
  });

  $effect(() => {
    // Re-run when host is bound or variant changes.
    const v = variant;
    if (host && v !== untrack(() => lastLoaded)) {
      mount(v).catch((err) => {
        console.error('[VariantRenderer] mount failed:', err);
      });
    }
  });
</script>

<div
  bind:this={host}
  data-testid="variant-host"
  data-variant={variant}
  role="region"
  aria-label={`Variant ${variant}`}
  style="display:block;width:100%;"
></div>
