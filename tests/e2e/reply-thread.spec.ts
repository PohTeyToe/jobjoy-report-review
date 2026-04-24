import { expect, test } from '@playwright/test';
import { ensureIdentity } from './helpers';

test('drop pin → open thread → reply persists across reload', async ({ page }) => {
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
  const composer = page.getByTestId('pin-composer');
  if (!(await composer.isVisible().catch(() => false))) {
    test.skip(true, 'Click did not land on a .page element in this variant.');
    return;
  }
  await page.getByTestId('pin-composer-input').fill('e2e: thread test');
  await page.getByTestId('pin-composer-submit').click();

  const marker = page.getByTestId('pin-marker').first();
  await expect(marker).toBeVisible();
  await marker.click();

  const panel = page.getByTestId('thread-panel');
  await expect(panel).toBeVisible();

  await page.getByTestId('thread-reply-input').fill('e2e reply line');
  await page.getByTestId('thread-reply-submit').click();

  // Reply renders in the comments list.
  await expect(panel.getByText('e2e reply line')).toBeVisible();

  // Reload — pin still there, click it, the reply text is still in the thread.
  await page.reload();
  await expect(page.getByTestId('pin-marker').first()).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('pin-marker').first().click();
  await expect(page.getByTestId('thread-panel')).toBeVisible();
  await expect(page.getByTestId('thread-panel').getByText('e2e reply line')).toBeVisible();
});
