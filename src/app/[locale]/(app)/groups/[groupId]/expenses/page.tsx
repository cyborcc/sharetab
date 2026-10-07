'use client';

import { use, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCents } from '@/lib/money';
import { categoryIcon } from '@/lib/categories';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ExpenseRow, PersonFilter, dayLabel, involves, type RowMember } from '@/components/expenses/expense-row';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** All expenses of a group (up to 100) with search and filters by person (paid or shares in), category and period. */
export default function AllExpensesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const locale = useLocale();
  const t = useTranslations('groups');
  const { data: authSession } = useSession();
  const myId = authSession?.user?.id;

  const group = trpc.groups.get.useQuery({ groupId });
  const expenses = trpc.expenses.list.useQuery({ groupId, limit: 100 });

  const [query, setQuery] = useState('');
  // Starts on the signed-in person; 'Alle' ('') is a choice
  const [chosenPerson, setPerson] = useState<string | null>(null);
  const person = chosenPerson ?? myId ?? '';
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const all = useMemo(() => expenses.data?.expenses ?? [], [expenses.data]);
  const categories = useMemo(
    () => [...new Set(all.map((e) => e.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  const isHidden = (e: (typeof all)[number]) => e.isPrivate && e.paidById !== myId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => {
      // Others' private expenses have nothing to match on, so they only show while no filter is active
      if (isHiddenFor(e, myId)) return !(q || category || person || from || to);
      if (person && !involves(e, person)) return false;
      if (category && e.category !== category) return false;
      const day = new Date(e.expenseDate).toLocaleDateString('sv-SE');
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q) {
        const hay = [e.title, e.description ?? '', e.category ?? '', e.placeName ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, query, person, category, from, to, myId]);

  if (group.isLoading || expenses.isLoading) return <LoadingSpinner />;
  if (!group.data) return null;
  const g = group.data;

  const members = new Map<string, RowMember>(g.members.map((m) => [m.user.id, m.user]));
  const days: { key: string; date: Date; items: typeof filtered }[] = [];
  for (const e of filtered) {
    const date = new Date(e.expenseDate);
    const key = date.toLocaleDateString('sv-SE');
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(e);
    else days.push({ key, date, items: [e] });
  }
  const sum = filtered.reduce((a, e) => a + (isHidden(e) ? 0 : (e.baseCurrencyAmount ?? e.amount)), 0);
  const filtering = !!(query || person || category || from || to);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/groups/${groupId}`} />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {g.emoji} {g.name} · {t('expList.title')}
        </h1>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-3">
          <Input
            className="col-span-2 sm:col-span-3"
            placeholder={t('expList.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="col-span-2 sm:col-span-3">
            <PersonFilter
              members={g.members.map((m) => ({ ...m.user }))}
              value={person}
              onChange={setPerson}
              myId={myId}
            />
          </div>
          <select className={SELECT_CLASS} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('expList.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryIcon(c)} {c}
              </option>
            ))}
          </select>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <Input type="date" aria-label={t('expList.from_')} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label={t('expList.to')} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {filtering && (
            <Button
              variant="ghost"
              size="sm"
              className="col-span-2 sm:col-span-3"
              onClick={() => {
                setQuery('');
                setPerson('');
                setCategory('');
                setFrom('');
                setTo('');
              }}
            >
              {t('expList.reset')}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t('expList.count', { count: filtered.length })}</span>
        <span>
          {t('expList.sum')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatCents(sum, g.currency, locale)}</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('expList.none')}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <div key={day.key}>
              <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dayLabel(day.date, locale, t('detail.today'), t('detail.yesterday'))}
              </p>
              <Card className="divide-y divide-border overflow-hidden py-0">
                {day.items.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    groupId={groupId}
                    groupCurrency={g.currency}
                    members={members}
                    myId={myId}
                  />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isHiddenFor(e: { isPrivate: boolean; paidById: string }, myId: string | undefined): boolean {
  return e.isPrivate && e.paidById !== myId;
}
