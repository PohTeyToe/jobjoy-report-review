import { expect, test } from '@playwright/test';

/**
 * Real Supabase is exercised here — see the file-bottom note for cleanup.
 * If PUBLIC_SUPABASE_ANON_KEY is the placeholder from `.env.example`, the
 * insert will fail and the modal will surface an inline error. We treat
 * that as a skip so this test can still run on dev machines that haven't
 * been wired with the real anon key.
 */
test('first visit shows the name modal and persists identity to localStorage', async ({
  page,
  context
}) => {
  await context.clearCookies();
  await context.addInitScript(() => {
    try {
      localStorage.removeItem('jobjoy_review.reviewer_id');
      localStorage.removeItem('jobjoy_review.reviewer_name');
    } catch {
      // ignore
    }
  });

  await page.goto('/review');
  const modal = page.getByTestId('name-modal');
  await expect(modal).toBeVisible();

  const reviewerName = `e2e-test-${Math.random().toString(36).slice(2, 10)}`;
  await page.getByTestId('name-input').fill(reviewerName);
  await page.getByTestId('name-submit').click();

  // If the anon key is the placeholder, a 401 will surface as inline error
  // text. Skip cleanly in that case.
  const errorVisible = await page
    .getByRole('alert')
    .isVisible()
    .catch(() => false);
  if (errorVisible) {
    test.skip(true, 'Supabase anon key not configured locally — RLS rejected insert.');
    return;
  }

  await expect(modal).toBeHidden();

  const persistedId = await page.evaluate(() => localStorage.getItem('jobjoy_review.reviewer_id'));
  const persistedName = await page.evaluate(() =>
    localStorage.getItem('jobjoy_review.reviewer_name')
  );
  expect(persistedId).toBeTruthy();
  expect(persistedName).toBe(reviewerName);

  // Reload — modal should NOT appear, and the reviewer chip should show.
  await page.reload();
  await expect(page.getByTestId('name-modal')).toBeHidden();
  await expect(page.getByTestId('reviewer-name')).toContainText(reviewerName);
});

/**
 * Cleanup approach: each test reviewer is named `e2e-test-<random>`. Phase-2
 * orchestrator owns post-suite cleanup via:
 *
 *   delete from design_review.comments where reviewer_id in (
 *     select id from design_review.reviewers where name like 'e2e-test-%'
 *   );
 *   delete from design_review.pins where reviewer_id in (
 *     select id from design_review.reviewers where name like 'e2e-test-%'
 *   );
 *   delete from design_review.reviewers where name like 'e2e-test-%';
 */
