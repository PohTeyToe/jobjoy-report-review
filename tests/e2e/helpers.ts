import { expect, type Page } from '@playwright/test';

/**
 * Walks through the NameModal if it appears, returning false when Supabase
 * is unreachable (the form surfaces a red `role="alert"` after the click).
 * Tests that need an identity should `test.skip(!ok, '...')` on the result.
 */
export async function ensureIdentity(page: Page): Promise<boolean> {
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
