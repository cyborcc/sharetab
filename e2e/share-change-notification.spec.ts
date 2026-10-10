import { test, expect } from '@playwright/test';
import { users, trpcMutation, trpcQuery, trpcResult, createTestGroup } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mutationResult(res: { json: () => Promise<any> }) {
  return (await res.json()).result?.data?.json;
}

type Item = { type: string; entityId: string | null; title: string; body: string };

async function notificationsOf(ctx: Parameters<typeof trpcQuery>[0]): Promise<Item[]> {
  const res = await trpcQuery(ctx, 'notifications.list');
  return (await trpcResult(res)).items as Item[];
}

test.describe('Share-change notifications', () => {
  test('a changed split with the same total notifies the person whose share changed, not the editor', async () => {
    const { owner, memberContexts, groupId, memberIds, dispose } = await createTestGroup(
      users.alice.email,
      users.alice.password,
      [{ email: users.bob.email, password: users.bob.password }],
      'Share Change Test',
    );
    try {
      const aliceId = memberIds[users.alice.email]!;
      const bobId = memberIds[users.bob.email]!;
      const created = await mutationResult(
        await trpcMutation(owner, 'expenses.create', {
          groupId,
          title: 'Share change dinner',
          amount: 3000,
          paidById: aliceId,
          splitMode: 'EXACT',
          shares: [
            { userId: aliceId, amount: 1500 },
            { userId: bobId, amount: 1500 },
          ],
        }),
      );

      // Same total, Bob's share goes from 15.00 to 20.00
      await mutationResult(
        await trpcMutation(owner, 'expenses.update', {
          groupId,
          expenseId: created.id,
          splitMode: 'EXACT',
          shares: [
            { userId: aliceId, amount: 1000 },
            { userId: bobId, amount: 2000 },
          ],
        }),
      );

      await expect
        .poll(
          async () =>
            (await notificationsOf(memberContexts[0]!)).filter(
              (n) => n.type === 'SHARE_CHANGED' && n.entityId === created.id,
            ).length,
        )
        .toBe(1);
      // The person who made the change is not told about their own edit
      const aliceItems = await notificationsOf(owner);
      expect(aliceItems.some((n) => n.type === 'SHARE_CHANGED' && n.entityId === created.id)).toBe(false);

      // Saving the same split again changes nobody's share: no second notification
      await mutationResult(
        await trpcMutation(owner, 'expenses.update', {
          groupId,
          expenseId: created.id,
          splitMode: 'EXACT',
          shares: [
            { userId: aliceId, amount: 1000 },
            { userId: bobId, amount: 2000 },
          ],
        }),
      );
      await new Promise((r) => setTimeout(r, 1000));
      const bobItems = await notificationsOf(memberContexts[0]!);
      expect(bobItems.filter((n) => n.type === 'SHARE_CHANGED' && n.entityId === created.id)).toHaveLength(1);
    } finally {
      await dispose();
    }
  });
});
