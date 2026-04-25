import { expect, test } from '@playwright/test';

test('deep SPA routes reach the app shell, not Vercel 404', async ({ page }) => {
  await page.goto('/pick');
  await expect(page).not.toHaveTitle(/404/i);

  await page.goto('/admin/some-arbitrary-secret');
  await expect(page).not.toHaveTitle(/404/i);
});

test('admin route cold-loads and renders the dashboard heading', async ({ page }) => {
  const res = await page.goto('/admin/some-arbitrary-secret');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
});

test('pick route cold-loads with a 200', async ({ page }) => {
  const res = await page.goto('/pick');
  expect(res?.status()).toBe(200);
});

test('variants asset path serves the static HTML, not the SPA shell', async ({ page }) => {
  const res = await page.goto('/variants/recommended/index.html');
  expect(res?.status()).toBe(200);
  // The static variant HTML carries data-variant-slug; the SPA fallback would
  // not. Hitting the SPA shell here would mean the rewrite is shadowing the
  // static asset.
  const html = await page.content();
  expect(html).toContain('data-variant-slug="recommended"');
});
