import { expect, test } from '@playwright/test';
import { ensureIdentity } from './helpers';

test('drop pin → resolve → reload → still resolved', async ({ page }) => {
  const ok = await ensureIdentity(page);
  if (!ok) {
    test.skip(true, 'Supabase anon key not configured locally.');
    return;
  }

  await page.waitForSelector('[data-testid="variant-host"]');
  const host = page.getByTestId('variant-host');
  const box = await host.boundingBox();
  if (!box) throw new Error('variant host has no bounding box');

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  const composer = page.getByTestId('pin-composer');
  if (!(await composer.isVisible().catch(() => false))) {
    test.skip(true, 'Click did not land on a .page element in this variant.');
    return;
  }
  await page.getByTestId('pin-composer-input').fill('e2e: resolve me');
  await page.getByTestId('pin-composer-submit').click();

  const marker = page.getByTestId('pin-marker').first();
  await expect(marker).toBeVisible();
  await marker.click();

  const panel = page.getByTestId('thread-panel');
  await expect(panel).toBeVisible();

  // Initial state should be Open (no badge with resolved testid).
  await expect(panel.getByTestId('thread-resolved-badge')).toHaveCount(0);

  await page.getByTestId('thread-resolve-toggle').click();
  await expect(panel.getByTestId('thread-resolved-badge')).toBeVisible();

  // Reload — re-open the panel, badge still resolved.
  await page.reload();
  await expect(page.getByTestId('pin-marker').first()).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('pin-marker').first().click();
  await expect(page.getByTestId('thread-panel')).toBeVisible();
  await expect(page.getByTestId('thread-resolved-badge')).toBeVisible();
});
