import webpush from 'web-push';
import type { PrismaClient } from '@/generated/prisma/client';
import { formatCents } from '@/lib/money';
import { logger } from './logger';

/** What happened. Only these reach a person: an expense they are in, a changed price, a payment to them. */
export type NotifyKind = 'EXPENSE_ADDED' | 'PRICE_CHANGED' | 'SETTLEMENT';

export type NotifyItem = {
  userId: string;
  kind: NotifyKind;
  groupId: string;
  /** Expense id (or settlement id): where the notification leads */
  entityId: string;
  vars: { actor: string; title?: string; amount?: string; share?: string; from?: string; to?: string };
};

const TEXTS: Record<'de' | 'en', Record<NotifyKind, (v: NotifyItem['vars']) => { title: string; body: string }>> = {
  de: {
    EXPENSE_ADDED: (v) => ({
      title: `${v.actor} hat „${v.title}“ gebucht`,
      body: v.share ? `${v.amount} · dein Anteil ${v.share}` : `${v.amount}`,
    }),
    PRICE_CHANGED: (v) => ({
      title: `${v.actor} hat den Preis von „${v.title}“ geändert`,
      body: `${v.from} → ${v.to}. Bitte prüfen.`,
    }),
    SETTLEMENT: (v) => ({ title: `${v.actor} hat dir ${v.amount} bezahlt`, body: '' }),
  },
  en: {
    EXPENSE_ADDED: (v) => ({
      title: `${v.actor} added “${v.title}”`,
      body: v.share ? `${v.amount} · your share ${v.share}` : `${v.amount}`,
    }),
    PRICE_CHANGED: (v) => ({
      title: `${v.actor} changed the price of “${v.title}”`,
      body: `${v.from} → ${v.to}. Please check.`,
    }),
    SETTLEMENT: (v) => ({ title: `${v.actor} paid you ${v.amount}`, body: '' }),
  },
};

export function money(cents: number, currency: string): string {
  try {
    return formatCents(cents, currency, 'de');
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

type VapidKeys = { publicKey: string; privateKey: string };
let vapidCache: VapidKeys | null = null;

/** VAPID keys for web push: from the environment, else generated once and kept in the database. */
export async function getVapidKeys(db: Pick<PrismaClient, 'systemSetting'>): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) return (vapidCache = { publicKey, privateKey });

  const stored = await db.systemSetting.findUnique({ where: { key: 'vapidKeys' } });
  if (stored) {
    try {
      const parsed = JSON.parse(stored.value) as VapidKeys;
      if (parsed.publicKey && parsed.privateKey) return (vapidCache = parsed);
    } catch {
      // regenerate below
    }
  }
  const keys = webpush.generateVAPIDKeys();
  const created = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  await db.systemSetting.upsert({
    where: { key: 'vapidKeys' },
    create: { key: 'vapidKeys', value: JSON.stringify(created) },
    update: { value: JSON.stringify(created) },
  });
  return (vapidCache = created);
}

type Db = Pick<PrismaClient, 'notification' | 'pushSubscription' | 'user' | 'systemSetting'>;

/**
 * Stores a notification per person (the bell) and sends it to their registered devices (push).
 * Never throws: a failed notification must not fail the booking that caused it.
 */
export async function sendNotifications(db: Db, items: NotifyItem[]): Promise<void> {
  try {
    if (items.length === 0) return;
    const users = await db.user.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.userId))] }, notifyEnabled: true, suspendedAt: null },
      select: { id: true, locale: true },
    });
    const localeOf = new Map(users.map((u) => [u.id, u.locale]));
    const wanted = items.filter((i) => localeOf.has(i.userId));
    if (wanted.length === 0) return;

    const texts = wanted.map((i) => {
      const lang = localeOf.get(i.userId)?.startsWith('de') ? 'de' : 'en';
      return { item: i, locale: localeOf.get(i.userId) ?? 'en', ...TEXTS[lang][i.kind](i.vars) };
    });
    await db.notification.createMany({
      data: texts.map(({ item, title, body }) => ({
        userId: item.userId,
        type: item.kind,
        groupId: item.groupId,
        entityId: item.entityId,
        title,
        body,
      })),
    });

    const subs = await db.pushSubscription.findMany({ where: { userId: { in: wanted.map((i) => i.userId) } } });
    if (subs.length === 0) return;
    const vapid = await getVapidKeys(db);
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com',
      vapid.publicKey,
      vapid.privateKey,
    );
    await Promise.all(
      subs.map(async (sub) => {
        const t = texts.find((x) => x.item.userId === sub.userId);
        if (!t) return;
        const path =
          t.item.kind === 'SETTLEMENT'
            ? `/${t.locale}/groups/${t.item.groupId}`
            : `/${t.locale}/groups/${t.item.groupId}/expenses/${t.item.entityId}`;
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: t.title, body: t.body, url: path }),
            { TTL: 60 * 60 * 24 },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
          } else {
            logger.warn('push.failed', { status });
          }
        }
      }),
    );
  } catch (err) {
    logger.warn('notifications.failed', { error: err instanceof Error ? err.message.slice(0, 200) : 'unknown' });
  }
}
