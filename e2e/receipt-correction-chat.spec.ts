import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { users, login, createTestGroup, authedContext, trpcMutation, trpcQuery, trpcResult } from './helpers';

// Opt in only against an isolated test deployment configured with AI_PROVIDER=mock.
test('group correction chat previews without mutation, discards, then explicitly confirms', async ({ page }) => {
  test.skip(process.env.E2E_AI_CORRECTION !== '1', 'Requires isolated test server and mock provider; never production');
  const ctx = await authedContext(users.alice.email, users.alice.password);
  const info = await trpcResult(await trpcQuery(ctx, 'receipts.getScanProviderInfo'));
  expect(info.activeProvider).toBe('mock');
  const { groupId, dispose } = await createTestGroup(
    users.alice.email,
    users.alice.password,
    [],
    'Correction chat test',
  );
  let receiptId: string | undefined;
  try {
    const uploaded = await ctx.post('/api/upload', {
      multipart: {
        file: {
          name: 'correction.png',
          mimeType: 'image/png',
          buffer: readFileSync(resolve('e2e/receipts/coffee-shop.png')),
        },
      },
    });
    receiptId = (await uploaded.json()).receiptId;
    expect(receiptId).toBeTruthy();
    const processed = await trpcMutation(ctx, 'receipts.processReceipt', { receiptId, groupId });
    expect((await processed.json()).result?.data?.json?.status).toBe('COMPLETED');
    const original = await trpcResult(await trpcQuery(ctx, 'receipts.getReceiptItems', { receiptId }));
    await login(page, users.alice.email, users.alice.password);
    await page.goto(`/en/groups/${groupId}/scan?receiptId=${receiptId}`);
    const chat = page.getByTestId('receipt-correction-chat');
    const assignment = page.getByTestId('item-assignment-form');
    await expect(chat).toBeVisible();
    await expect(assignment).toBeVisible();
    // The correction chat is collapsed until opened
    await expect(chat.getByTestId('correction-hint')).toHaveCount(0);
    await chat.getByTestId('correction-toggle').click();
    await chat.getByTestId('correction-hint').fill('Add the missed item');
    await chat.getByTestId('correction-send').click();
    await expect(chat.getByTestId('correction-preview')).toContainText('Corrected Item');
    expect(await trpcResult(await trpcQuery(ctx, 'receipts.getReceiptItems', { receiptId }))).toEqual(original);
    await expect(assignment).not.toContainText('Corrected Item');
    await chat.getByTestId('correction-discard').click();
    await expect(chat.getByTestId('correction-preview')).toHaveCount(0);
    expect(await trpcResult(await trpcQuery(ctx, 'receipts.getReceiptItems', { receiptId }))).toEqual(original);
    await chat.getByTestId('correction-hint').fill('Add the missed item');
    await chat.getByTestId('correction-send').click();
    await expect(chat.getByTestId('correction-preview')).toContainText('Corrected Item');
    await chat.getByTestId('correction-apply').click();
    await expect(chat.getByTestId('correction-preview')).toHaveCount(0);
    await expect(assignment).toContainText('Corrected Item');
    const updated = await trpcResult(await trpcQuery(ctx, 'receipts.getReceiptItems', { receiptId }));
    expect(updated.items).toHaveLength(original.items.length + 1);
    expect(updated.receipt.extractedData.total).toBeGreaterThan(original.receipt.extractedData.total);
  } finally {
    if (receiptId) await trpcMutation(ctx, 'receipts.deletePending', { receiptId });
    await dispose();
    await ctx.dispose();
  }
});
