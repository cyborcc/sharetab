import { test, expect } from '@playwright/test';
import { login, users } from './helpers';

test.describe('Support dialog', () => {
  test('the beer button opens Ko-fi’s donation form inside the app', async ({ page }) => {
    await login(page, users.alice.email, users.alice.password);
    await expect(page.getByTestId('support-iframe')).toHaveCount(0);

    await page.locator('[data-testid="beer-button"]:visible').click();

    const dialog = page.getByTestId('support-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('support-iframe')).toHaveAttribute(
      'src',
      /^https:\/\/ko-fi\.com\/aks\/\?.*embed=true/,
    );
    await expect(page.getByTestId('support-open-kofi')).toHaveAttribute('href', 'https://ko-fi.com/aks');

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('support-iframe')).toHaveCount(0);
  });
});
