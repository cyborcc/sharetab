import { describe, expect, it, vi } from 'vitest';
import { sendNotifications, type NotifyItem } from './notifications';

const item = (userId: string, kind: NotifyItem['kind'] = 'PRICE_CHANGED'): NotifyItem => ({
  userId,
  kind,
  groupId: 'g1',
  entityId: 'e1',
  vars: { actor: 'Alex', title: 'Abendessen', from: '10,00 €', to: '12,00 €', amount: '12,00 €', share: '4,00 €' },
});

function fakeDb(users: { id: string; locale: string }[], subs: unknown[] = []) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(users) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    pushSubscription: { findMany: vi.fn().mockResolvedValue(subs), deleteMany: vi.fn() },
    systemSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  };
}

describe('sendNotifications', () => {
  it('stores a German message for German users and an English one for the rest', async () => {
    const db = fakeDb([
      { id: 'a', locale: 'de' },
      { id: 'b', locale: 'en' },
    ]);
    await sendNotifications(db as never, [item('a'), item('b')]);
    const rows = db.notification.createMany.mock.calls[0]![0].data as { userId: string; title: string; body: string }[];
    expect(rows.find((r) => r.userId === 'a')).toMatchObject({
      title: 'Alex hat den Preis von „Abendessen“ geändert',
      body: '10,00 € → 12,00 €. Bitte prüfen.',
    });
    expect(rows.find((r) => r.userId === 'b')!.title).toBe('Alex changed the price of “Abendessen”');
  });

  it('skips people who switched notifications off (not returned by the query)', async () => {
    const db = fakeDb([{ id: 'a', locale: 'de' }]);
    await sendNotifications(db as never, [item('a'), item('off')]);
    const rows = db.notification.createMany.mock.calls[0]![0].data as { userId: string }[];
    expect(rows.map((r) => r.userId)).toEqual(['a']);
  });

  it('never throws, even when the database fails', async () => {
    const db = fakeDb([]);
    db.user.findMany.mockRejectedValue(new Error('db down'));
    await expect(sendNotifications(db as never, [item('a')])).resolves.toBeUndefined();
  });

  it('does nothing without recipients', async () => {
    const db = fakeDb([]);
    await sendNotifications(db as never, []);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
