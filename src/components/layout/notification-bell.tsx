'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';

/** Bell with the number of unread notifications; opens the notifications page. */
export function NotificationBell() {
  const t = useTranslations('common.notifications');
  const unread = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 60_000 });
  const count = unread.data ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? t('bellUnread', { count }) : t('title')}
      title={t('title')}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      data-testid="notification-bell"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
