'use client';

import { use, useMemo, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCents } from '@/lib/money';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { MemberAvatar, dayLabel, memberName, type RowMember } from '@/components/expenses/expense-row';

type Meta = {
  title?: string;
  amount?: number;
  currency?: string;
  toId?: string;
  placeholderName?: string;
  itemName?: string;
  changes?: unknown;
};

const FIELDS = ['title', 'amount', 'currency', 'category', 'placeName', 'paidById', 'expenseDate', 'shares'] as const;

/** Group history: who added, changed or deleted what, newest first. */
export default function GroupHistoryPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const locale = useLocale();
  const t = useTranslations('groups');
  const group = trpc.groups.get.useQuery({ groupId });
  const activity = trpc.activity.getGroupActivity.useInfiniteQuery(
    { groupId, limit: 30 },
    { getNextPageParam: (last) => last.nextCursor },
  );

  const entries = useMemo(() => activity.data?.pages.flatMap((p) => p.items) ?? [], [activity.data]);
  const days = useMemo(() => {
    const out: { key: string; date: Date; items: typeof entries }[] = [];
    for (const e of entries) {
      const date = new Date(e.createdAt);
      const key = date.toLocaleDateString('sv-SE');
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, date, items: [e] });
    }
    return out;
  }, [entries]);

  if ((group.isLoading || activity.isLoading) && !group.isError) return <LoadingSpinner />;
  if (!group.data) return null;

  const g = group.data;
  const members = new Map<string, RowMember>(g.members.map((m) => [m.user.id, m.user]));
  const first = (id: string | undefined | null) => (id ? memberName(members.get(id), '?').split(' ')[0]! : '?');
  const money = (cents: number, currency?: string) => {
    try {
      return formatCents(cents, currency ?? g.currency, locale);
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency ?? g.currency}`;
    }
  };
  const time = (d: Date | string) => new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  function value(field: string, v: unknown, currency?: string): string {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'paidById') return first(String(v));
    if (field === 'amount' && typeof v === 'number') return money(v, currency);
    if (field === 'expenseDate') return new Date(String(v)).toLocaleDateString(locale);
    return String(v);
  }

  function changeList(meta: Meta): string | null {
    const raw = meta.changes;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const changes = raw as Record<string, [unknown, unknown]>;
    const parts = FIELDS.filter((f) => changes[f]).map((f) => {
      const [from, to] = changes[f]!;
      if (f === 'shares') return t('history.field.shares');
      return `${t(`history.field.${f}`)}: ${value(f, from, meta.currency)} → ${value(f, to, meta.currency)}`;
    });
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  function describe(e: (typeof entries)[number]): { text: ReactNode; detail?: string | null } {
    const meta = (e.metadata ?? {}) as Meta;
    const who = first(e.userId);
    const title = e.expense?.title ?? meta.title;
    const expenseLink = (label: string) =>
      e.expense ? (
        <Link href={`/groups/${groupId}/expenses/${e.expense.id}`} className="font-medium text-primary hover:underline">
          {label}
        </Link>
      ) : (
        <span className="font-medium">{label}</span>
      );
    const named = title ?? (e.isPrivate ? t('detail.privateExpense') : t('history.anExpense'));
    const amount = meta.amount !== undefined ? ` (${money(meta.amount, meta.currency)})` : '';

    switch (e.type) {
      case 'EXPENSE_CREATED':
        return {
          text: (
            <>
              {t('history.created', { name: who })} {expenseLink(named)}
              {amount}
            </>
          ),
        };
      case 'EXPENSE_UPDATED':
        return {
          text: (
            <>
              {t('history.updated', { name: who })} {expenseLink(named)}
            </>
          ),
          detail: changeList(meta),
        };
      case 'EXPENSE_DELETED':
        return {
          text: (
            <>
              {t('history.deleted', { name: who })}{' '}
              <span className="font-medium line-through">{meta.title ?? t('history.anExpense')}</span>
              {amount}
            </>
          ),
        };
      case 'SETTLEMENT_CREATED':
        return {
          text: t('history.settled', {
            name: who,
            to: first(meta.toId),
            amount: meta.amount !== undefined ? money(meta.amount, meta.currency) : '',
          }),
        };
      case 'RECEIPT_ITEMS_CHANGED':
        return { text: t('history.receiptItems', { name: who }), detail: meta.itemName ?? null };
      case 'MEMBER_JOINED':
        return { text: t('history.joined', { name: who }) };
      case 'MEMBER_LEFT':
        return { text: t('history.left', { name: who }) };
      case 'PLACEHOLDER_CREATED':
        return { text: t('history.placeholderCreated', { name: who, placeholder: meta.placeholderName ?? '?' }) };
      case 'PLACEHOLDER_MERGED':
        return { text: t('history.placeholderMerged', { name: who }) };
      case 'GROUP_ARCHIVED':
        return { text: t('history.archived', { name: who }) };
      case 'GROUP_UNARCHIVED':
        return { text: t('history.unarchived', { name: who }) };
      default:
        return { text: t('history.groupUpdated', { name: who }) };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/groups/${groupId}`} />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {g.emoji} {g.name} · {t('history.title')}
        </h1>
      </div>

      {days.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('history.empty')}</CardContent>
        </Card>
      ) : (
        days.map((day) => (
          <div key={day.key}>
            <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {dayLabel(day.date, locale, t('detail.today'), t('detail.yesterday'))}
            </p>
            <Card className="divide-y divide-border overflow-hidden py-0">
              {day.items.map((e) => {
                const { text, detail } = describe(e);
                return (
                  <div key={e.id} className="flex gap-3 px-4 py-3" data-testid="history-entry">
                    <MemberAvatar member={members.get(e.userId ?? '')} id={e.userId ?? 'deleted'} className="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{text}</p>
                      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{time(e.createdAt)}</span>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}

      {activity.hasNextPage && (
        <div className="text-center">
          <Button variant="outline" disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
            {activity.isFetchingNextPage ? t('history.loading') : t('history.more')}
          </Button>
        </div>
      )}
    </div>
  );
}
