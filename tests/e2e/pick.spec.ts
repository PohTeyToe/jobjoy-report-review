import { expect, test } from '@playwright/test';

test('pick flow: name modal → drag rank → submit → confirmation; reload pre-populates', async ({
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

  await page.goto('/pick');

  // Name modal first.
  const modal = page.getByTestId('name-modal');
  await expect(modal).toBeVisible();

  const reviewerName = `e2e-test-${Math.random().toString(36).slice(2, 10)}`;
  await page.getByTestId('name-input').fill(reviewerName);
  await page.getByTestId('name-submit').click();

  // If the anon key is the placeholder, identity insert will 401.
  if (
    await page
      .getByRole('alert')
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, 'Supabase anon key not configured locally — RLS rejected insert.');
    return;
  }
  await expect(modal).toBeHidden();

  // Six cards present.
  const cards = page.getByTestId('pick-card');
  await expect(cards).toHaveCount(6);

  // Promote the rank-6 card to rank 1 via the click shortcut. Drag-and-drop
  // is exercised in the unit suite; e2e prefers the more reliable click path
  // here so we don't fight Playwright's drag heuristics across browsers.
  const initialBottom = cards.nth(5);
  const bottomSlug = await initialBottom.getAttribute('data-slug');
  expect(bottomSlug).toBeTruthy();
  await initialBottom.click();

  // The clicked card should now be rank 1.
  await expect(page.locator('[data-testid="pick-card"][data-rank="1"]')).toHaveAttribute(
    'data-slug',
    bottomSlug as string
  );

  await page.getByTestId('pick-notes').fill('e2e: thoughts on the lineup');
  await page.getByTestId('pick-submit').click();

  // Confirmation surface: either the persistent "Saved" flag or the toast.
  const confirmed = page.getByTestId('pick-submitted-flag').or(page.getByTestId('pick-toast'));
  await expect(confirmed).toBeVisible({ timeout: 10_000 });

  // Now reload — modal should NOT appear (identity persisted), and the
  // ranking should be hydrated from the prior submission.
  await page.reload();
  await expect(page.getByTestId('name-modal')).toBeHidden();
  await expect(page.getByTestId('pick-card')).toHaveCount(6);
  await expect(page.locator('[data-testid="pick-card"][data-rank="1"]')).toHaveAttribute(
    'data-slug',
    bottomSlug as string,
    { timeout: 10_000 }
  );
  await expect(page.getByTestId('pick-notes')).toHaveValue('e2e: thoughts on the lineup');
});

/**
 * Cleanup mirrors the identity spec: e2e reviewers are named `e2e-test-<random>`.
 *
 *   delete from design_review.variant_picks where reviewer_id in (
 *     select id from design_review.reviewers where name like 'e2e-test-%'
 *   );
 *   delete from design_review.reviewers where name like 'e2e-test-%';
 */
