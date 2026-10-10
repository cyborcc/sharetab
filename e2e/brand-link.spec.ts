import { test, expect } from '@playwright/test';
import { users, login } from './helpers';

test.describe('Brand link', () => {
  test('clicking the Splitbon name leads to the dashboard', async ({ page }) => {
    await login(page, users.alice.email, users.alice.password);
    await page.goto('/en/groups');
    await page.locator('[data-testid="brand-link"]:visible').click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
