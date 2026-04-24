import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Two reviewers in parallel browser contexts. Each drops a pin, then both
 * should see both pins (with correct attribution) within a few seconds via
 * the realtime subscription on `design_review.pins`.
 *
 * Skipped automatically when the Supabase anon key isn't usable locally —
 * the inserts fail and the page surfaces a name-modal alert instead.
 */
async function bootReviewer(ctx: BrowserContext, name: string): Promise<Page | null> {
  const page = await ctx.newPage();
  await page.goto('/review');
  const modal = page.getByTestId('name-modal');
  if (await modal.isVisible().catch(() => false)) {
    await page.getByTestId('name-input').fill(name);
    await page.getByTestId('name-submit').click();
    if (
      await page
        .getByRole('alert')
        .isVisible()
        .catch(() => false)
    ) {
      return null;
    }
    await expect(modal).toBeHidden();
  }
  await page.waitForSelector('[data-testid="variant-host"]');
  return page;
}

async function dropPin(page: Page, body: string, yFrac: number): Promise<boolean> {
  const host = page.getByTestId('variant-host');
  const box = await host.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * yFrac);
  const composer = page.getByTestId('pin-composer');
  if (!(await composer.isVisible().catch(() => false))) return false;
  await page.getByTestId('pin-composer-input').fill(body);
  await page.getByTestId('pin-composer-submit').click();
  return true;
}

test('two reviewers each drop a pin and see both with correct attribution', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  try {
    const nameA = `e2e-test-${Math.random().toString(36).slice(2, 10)}`;
    const nameB = `e2e-test-${Math.random().toString(36).slice(2, 10)}`;

    const pageA = await bootReviewer(ctxA, nameA);
    const pageB = await bootReviewer(ctxB, nameB);
    if (!pageA || !pageB) {
      test.skip(true, 'Supabase anon key not configured locally.');
      return;
    }

    const okA = await dropPin(pageA, `e2e A: ${nameA}`, 0.35);
    const okB = await dropPin(pageB, `e2e B: ${nameB}`, 0.55);
    if (!okA || !okB) {
      test.skip(true, 'Click did not land on a .page element in this variant.');
      return;
    }

    // Each context should eventually see two markers (their own + the other).
    await expect(pageA.getByTestId('pin-marker')).toHaveCount(2, { timeout: 15_000 });
    await expect(pageB.getByTestId('pin-marker')).toHaveCount(2, { timeout: 15_000 });

    // Open the latest pin on A and confirm reviewer attribution surfaces.
    // We don't depend on which marker is "B's" — instead open each in turn
    // and check that both names appear across the two threads.
    const markersA = await pageA.getByTestId('pin-marker').all();
    const seenNames = new Set<string>();
    for (const m of markersA) {
      await m.click();
      await expect(pageA.getByTestId('thread-panel')).toBeVisible();
      const headerText = (await pageA.getByTestId('thread-panel').textContent()) ?? '';
      if (headerText.includes(nameA)) seenNames.add(nameA);
      if (headerText.includes(nameB)) seenNames.add(nameB);
      await pageA.getByTestId('thread-close').click();
    }
    expect(seenNames.has(nameA)).toBe(true);
    expect(seenNames.has(nameB)).toBe(true);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
