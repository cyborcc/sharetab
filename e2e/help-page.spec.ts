import { test, expect } from '@playwright/test';
import { login, users } from './helpers';

test.describe('Help page', () => {
  test('lists the four steps with their demo videos', async ({ page }) => {
    await login(page, users.alice.email, users.alice.password);
    await page.goto('/en/help');
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    for (const step of ['create', 'invite', 'scan', 'settle']) {
      await expect(page.getByTestId(`help-step-${step}`).locator('video')).toHaveCount(1);
    }
    const res = await page.request.get('/help/receipt-scan.mp4');
    expect(res.ok()).toBe(true);
  });

  test('is reachable from the sidebar', async ({ page }) => {
    await login(page, users.alice.email, users.alice.password);
    await page.locator('aside').getByRole('link', { name: 'How it works' }).click();
    await expect(page).toHaveURL(/\/en\/help$/);
  });
});
