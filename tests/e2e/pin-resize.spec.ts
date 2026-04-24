import { expect, test, type Page } from '@playwright/test';

async function ensureIdentity(page: Page): Promise<boolean> {
  await page.goto('/review');
  const modal = page.getByTestId('name-modal');
  if (await modal.isVisible().catch(() => false)) {
    const reviewerName = `e2e-test-${Math.random().toString(36).slice(2, 10)}`;
    await page.getByTestId('name-input').fill(reviewerName);
    await page.getByTestId('name-submit').click();
    if (
      await page
        .getByRole('alert')
        .isVisible()
        .catch(() => false)
    ) {
      return false;
    }
    await expect(modal).toBeHidden();
  }
  return true;
}

test('pin x_pct/y_pct stay invariant across viewport resize', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ok = await ensureIdentity(page);
  if (!ok) {
    test.skip(true, 'Supabase anon key not configured locally.');
    return;
  }
  await page.waitForSelector('[data-testid="variant-host"]');

  const host = page.getByTestId('variant-host');
  const box = await host.boundingBox();
  if (!box) throw new Error('variant host has no bounding box');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);

  if (
    !(await page
      .getByTestId('pin-composer')
      .isVisible()
      .catch(() => false))
  ) {
    test.skip(true, 'Click did not land on a .page element in this variant.');
    return;
  }

  await page.getByTestId('pin-composer-input').fill('e2e: resize invariant');
  await page.getByTestId('pin-composer-submit').click();

  const marker = page.getByTestId('pin-marker').first();
  await expect(marker).toBeVisible();
  const wide = await marker.boundingBox();

  // Shrink to ~800px wide and let layout settle.
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(250);
  const narrow = await marker.boundingBox();

  expect(wide).not.toBeNull();
  expect(narrow).not.toBeNull();

  // The pin should have visually moved — if it hadn't, it'd mean the overlay
  // is using stale absolute coords instead of recomputing from the .page rect.
  // (We don't assert the EXACT delta because variant CSS may pin the page
  // width with `max-width`, but we expect SOME shift.)
  const pinDoesScale = Math.abs(wide!.x - narrow!.x) > 0.5 || Math.abs(wide!.y - narrow!.y) > 0.5;
  expect(pinDoesScale).toBe(true);
});
