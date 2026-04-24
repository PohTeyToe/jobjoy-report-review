import { expect, test } from '@playwright/test';

const SECRET = process.env.PUBLIC_ADMIN_SECRET ?? 'placeholder-rotate-before-shipping';

test('bad secret renders 404', async ({ page }) => {
  const res = await page.goto('/admin/definitely-wrong-secret');
  expect(res?.status()).toBe(404);
});

test('good secret shows the dashboard scaffold', async ({ page }) => {
  await page.goto(`/admin/${SECRET}`);
  await expect(page.getByTestId('admin-dashboard')).toBeVisible();
  await expect(page.getByTestId('pin-filters')).toBeVisible();
  await expect(page.getByTestId('picks-panel')).toBeVisible();
  await expect(page.getByTestId('export-feedback-pack')).toBeVisible();
});

test('export button triggers a markdown download with the expected filename', async ({ page }) => {
  await page.goto(`/admin/${SECRET}`);
  await expect(page.getByTestId('admin-dashboard')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-feedback-pack').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^jobjoy-feedback-\d{4}-\d{2}-\d{2}\.md$/);

  const stream = await download.createReadStream();
  if (!stream) {
    test.skip(true, 'Browser did not expose download stream.');
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString('utf-8');
  expect(body).toContain('# JobJoy Sample 1 — Design Review Feedback Pack');
});

test('row click opens the thread panel and writes ?pin to the URL', async ({ page }) => {
  await page.goto(`/admin/${SECRET}`);
  await expect(page.getByTestId('admin-dashboard')).toBeVisible();

  const firstRow = page.getByTestId('pin-row').first();
  const hasRow = await firstRow.isVisible().catch(() => false);
  test.skip(!hasRow, 'No pins seeded for admin row-click flow.');

  const pinId = await firstRow.getAttribute('data-pin-id');
  await firstRow.click();
  await expect(page.getByTestId('thread-panel')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`pin=${pinId}`));
});
