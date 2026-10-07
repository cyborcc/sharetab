'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { categoryIcon } from '@/lib/categories';
import { avatarColor, getInitials } from '@/lib/avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export type RowMember = {
  id: string;
  name: string | null;
  email?: string | null;
  image?: string | null;
  placeholderName?: string | null;
};

export type RowExpense = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  baseCurrencyAmount: number | null;
  category: string | null;
  placeName: string | null;
  isPrivate: boolean;
  expenseDate: Date | string;
  paidById: string;
  shares: { userId: string; amount: number }[];
};

export function memberName(m: RowMember | undefined, fallback = '?'): string {
  return m?.placeholderName ?? m?.name ?? m?.email ?? fallback;
}

/** Round avatar: the profile picture, or initials on the member's colour. */
export function MemberAvatar({
  member,
  id,
  className = 'h-6 w-6 text-[10px]',
  ring = false,
}: {
  member: RowMember | undefined;
  id: string;
  className?: string;
  ring?: boolean;
}) {
  const initials = getInitials(member?.placeholderName ?? member?.name ?? null, member?.email ?? null);
  const ringClass = ring ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : '';
  if (member?.image) {
    return (
      <Avatar className={`${className} ${ringClass}`} title={memberName(member)}>
        <AvatarImage src={member.image} />
        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <span
      title={memberName(member)}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white ${avatarColor(id)} ${className} ${ringClass}`}
    >
      {initials}
    </span>
  );
}

/** Is the person in this expense at all: paid for it or has a share. */
export function involves(e: Pick<RowExpense, 'paidById' | 'shares'>, userId: string): boolean {
  return e.paidById === userId || e.shares.some((s) => s.userId === userId && s.amount > 0);
}

/** Day heading for a list grouped by date: today, yesterday, otherwise weekday and date. */
export function dayLabel(date: Date, locale: string, today: string, yesterday: string): string {
  const day = date.toLocaleDateString('sv-SE');
  const now = new Date();
  if (day === now.toLocaleDateString('sv-SE')) return today;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (day === y.toLocaleDateString('sv-SE')) return yesterday;
  return date.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/**
 * One expense: what, who paid, who is in it (avatars), the amount in group currency with the
 * original currency below, and the viewer's own share.
 */
export function ExpenseRow({
  expense: e,
  groupId,
  groupCurrency,
  members,
  myId,
}: {
  expense: RowExpense;
  groupId: string;
  groupCurrency: string;
  members: Map<string, RowMember>;
  myId: string | undefined;
}) {
  const t = useTranslations('groups');
  const locale = useLocale();
  const hidden = e.isPrivate && e.paidById !== myId;
  const converted = e.baseCurrencyAmount != null && e.currency.toUpperCase() !== groupCurrency.toUpperCase();
  const groupAmount = e.baseCurrencyAmount ?? e.amount;
  const factor = converted && e.amount > 0 ? groupAmount / e.amount : 1;
  const participants = e.shares.filter((s) => s.amount > 0);
  const mine = e.shares.find((s) => s.userId === myId);
  const payer = members.get(e.paidById);
  const shown = participants.slice(0, 6);

  return (
    <Link href={`/groups/${groupId}/expenses/${e.id}`} className="block">
      <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-lg">
          {hidden ? '🔒' : categoryIcon(e.category)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate font-medium">
              {hidden ? t('detail.privateExpense') : e.title}
              {e.isPrivate && !hidden && <span className="ml-1.5 text-xs text-muted-foreground">🔒</span>}
            </p>
            {!hidden && (
              <p className="shrink-0 font-semibold tabular-nums">{formatCents(groupAmount, groupCurrency, locale)}</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p className="flex min-w-0 items-center gap-1.5">
              <MemberAvatar member={payer} id={e.paidById} className="h-4 w-4 text-[7px]" />
              <span className="truncate">
                {t('detail.paidShort', {
                  name: e.paidById === myId ? t('detail.you') : memberName(payer).split(' ')[0]!,
                })}
                {e.placeName && ` · 📍 ${e.placeName.split(', ')[0]}`}
              </span>
            </p>
            {!hidden && converted && (
              <span className="shrink-0 tabular-nums">{formatCents(e.amount, e.currency, locale)}</span>
            )}
          </div>
          {!hidden && participants.length > 0 && (
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <div className="flex items-center" aria-label={t('detail.involved')}>
                <div className="flex -space-x-1.5">
                  {shown.map((s) => (
                    <MemberAvatar
                      key={s.userId}
                      member={members.get(s.userId)}
                      id={s.userId}
                      className="h-5 w-5 border-2 border-background text-[8px]"
                    />
                  ))}
                </div>
                {participants.length > shown.length && (
                  <span className="ml-1 text-xs text-muted-foreground">+{participants.length - shown.length}</span>
                )}
                {participants.length === 1 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {t('detail.onlyFor', { name: memberName(members.get(participants[0]!.userId)).split(' ')[0]! })}
                  </span>
                )}
              </div>
              {mine && mine.amount > 0 && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums">
                  {t('detail.yourShare', {
                    amount: formatCents(Math.round(mine.amount * factor), groupCurrency, locale),
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Chips to narrow a list to everything, the viewer's own, or one person's expenses. */
export function PersonFilter({
  members,
  value,
  onChange,
  myId,
}: {
  members: RowMember[];
  value: string;
  onChange: (value: string) => void;
  myId: string | undefined;
}) {
  const t = useTranslations('groups');
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
    }`;
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" data-testid="person-filter">
      <button type="button" className={chip(value === '')} onClick={() => onChange('')}>
        {t('detail.filterAll')}
      </button>
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          className={chip(value === m.id)}
          onClick={() => onChange(value === m.id ? '' : m.id)}
        >
          <MemberAvatar member={m} id={m.id} className="h-4 w-4 text-[7px]" />
          {m.id === myId ? t('detail.you') : memberName(m).split(' ')[0]}
        </button>
      ))}
    </div>
  );
}
