import { expect, test } from '@playwright/test';

test('deep SPA routes reach the app shell, not Vercel 404', async ({ page }) => {
  await page.goto('/pick');
  await expect(page).not.toHaveTitle(/404/i);

  await page.goto('/admin/some-arbitrary-secret');
  await expect(page).not.toHaveTitle(/404/i);
});
