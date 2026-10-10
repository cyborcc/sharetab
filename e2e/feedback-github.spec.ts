import { test, expect } from '@playwright/test';
import { login, users } from './helpers';

test.describe('Feedback → GitHub', () => {
  test('an entry can be reported as a pre-filled GitHub issue', async ({ page }) => {
    await login(page, users.alice.email, users.alice.password);
    await page.goto('/en/feedback');

    const title = `GitHub link test ${Date.now()}`;
    await page.getByLabel('Short title').fill(title);
    await page.getByLabel('Details (optional)').fill('Steps & details');
    await page.getByTestId('feedback-send').click();

    const entry = page.getByTestId('feedback-entry').filter({ hasText: title });
    await expect(entry).toBeVisible();
    const href = await entry.getByTestId('feedback-github').getAttribute('href');
    const url = new URL(href!);
    expect(url.origin + url.pathname).toBe('https://github.com/cyborcc/splitbon/issues/new');
    expect(url.searchParams.get('title')).toBe(title);
    expect(url.searchParams.get('body')).toContain('Steps & details');

    // Clean up: withdraw the entry again
    page.once('dialog', (d) => d.accept());
    await entry.getByRole('button', { name: 'Withdraw' }).click();
    await expect(entry).toHaveCount(0);
  });
});
