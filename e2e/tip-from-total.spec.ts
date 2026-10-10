import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { users, login, navigateToGroup, authedContext, trpcMutation, trpcQuery, trpcResult } from './helpers';

const RECEIPT_PATH = resolve('e2e/receipts/coffee-shop.png');
const BASE = process.env.BASE_URL || 'http://localhost:3001';

test.describe('Tip from the total paid, and amount fields', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (!process.env.RUN_AI_TESTS) testInfo.skip(true, 'Set RUN_AI_TESTS=1 to enable');
    await login(page, users.alice.email, users.alice.password);
  });
  test.setTimeout(120_000);

  test('the paid total fills in the tip, and the tip field takes a decimal comma', async ({ page }) => {
    const ctx = await authedContext(users.alice.email, users.alice.password);
    const groups = await trpcResult(await trpcQuery(ctx, 'groups.list'));
    const groupId = (groups.find((g: { name: string }) => g.name === 'Apartment') ?? groups[0]).id;
    const uploadRes = await ctx.post(`${BASE}/api/upload`, {
      multipart: { file: { name: 'tip-total.png', mimeType: 'image/png', buffer: readFileSync(RECEIPT_PATH) } },
    });
    const { receiptId } = await uploadRes.json();
    await trpcMutation(ctx, 'receipts.processReceipt', { receiptId, groupId }, 120000);
    await ctx.dispose();

    await navigateToGroup(page, 'Apartment');
    await page.goto(`${page.url()}/scan?receiptId=${receiptId}`);
    await expect(page.getByTestId('item-assignment-form')).toBeVisible({ timeout: 30000 });

    // A tip typed with a comma stays in the field
    const tipInput = page.getByTestId('tip-input');
    await tipInput.fill('2,5');
    await expect(tipInput).toHaveValue('2,5');

    // A total far above items plus tax gives a calculated tip and locks the tip field
    const paid = page.getByTestId('paid-total-input');
    await paid.fill('9999,99');
    await expect(paid).toHaveValue('9999,99');
    await expect(tipInput).toBeDisabled();
    await expect(page.getByTestId('paid-total-hint')).toContainText(/\d/);

    // Clearing the total gives the tip field back
    await paid.fill('');
    await expect(tipInput).toBeEnabled();
  });
});
