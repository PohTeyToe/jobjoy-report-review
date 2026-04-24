import { expect, test } from '@playwright/test';

test('landing page renders all six variant cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'JobJoy Report Review' })).toBeVisible();
  for (const slug of [
    'faithful',
    'recommended',
    'impeccable',
    'taste-frontend',
    'huashu',
    'baseline'
  ]) {
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
  }
});

test('review route honors the variant query param', async ({ page }) => {
  await page.goto('/review?variant=huashu');
  await expect(page.getByText('huashu', { exact: false })).toBeVisible();
});
