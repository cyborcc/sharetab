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

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** All expenses of a group (up to 100) with search and filters by person, category and period. */
export default function AllExpensesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const locale = useLocale();
  const t = useTranslations('groups');
  const { data: authSession } = useSession();
  const myId = authSession?.user?.id;

  const group = trpc.groups.get.useQuery({ groupId });
  const expenses = trpc.expenses.list.useQuery({ groupId, limit: 100 });

  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('');
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
      if (person && e.paidById !== person) return false;
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

  const sum = filtered.reduce(
    (a, e) => a + (isHidden(e) ? 0 : (e.baseCurrencyAmount ?? e.amount)),
    0,
  );
  const filtering = !!(query || person || category || from || to);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/groups/${groupId}`} />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">
          {g.emoji} {g.name} · {t('list.title')}
        </h1>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-3">
          <Input
            className="col-span-2 sm:col-span-3"
            placeholder={t('list.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className={SELECT_CLASS} value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">{t('list.allPeople')}</option>
            {g.members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.placeholderName ?? m.user.name ?? m.user.email}
              </option>
            ))}
          </select>
          <select className={SELECT_CLASS} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('list.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryIcon(c)} {c}
              </option>
            ))}
          </select>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <Input type="date" aria-label={t('list.from_')} value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" aria-label={t('list.to')} value={to} onChange={(e) => setTo(e.target.value)} />
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
              {t('list.reset')}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t('list.count', { count: filtered.length })}</span>
        <span>
          {t('list.sum')}: <span className="font-semibold text-foreground tabular-nums">{formatCents(sum, g.currency, locale)}</span>
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('list.none')}</CardContent>
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {filtered.map((e) => {
            const hidden = isHidden(e);
            return (
              <Link key={e.id} href={`/groups/${groupId}/expenses/${e.id}`} className="block">
                <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-base">
                      {hidden ? '🔒' : categoryIcon(e.category)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{hidden ? t('detail.privateExpense') : e.title}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {t('list.paidBy')} {e.paidBy.name ?? e.paidBy.email ?? t('detail.unknown')}
                        {' · '}
                        {new Date(e.expenseDate).toLocaleDateString(locale)}
                        {e.placeName && ` · 📍 ${e.placeName}`}
                      </p>
                    </div>
                  </div>
                  {!hidden && (
                    <p className="ml-4 shrink-0 text-lg font-semibold tabular-nums">
                      {formatCents(e.amount, e.baseCurrencyAmount != null ? e.currency : g.currency, locale)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function isHiddenFor(e: { isPrivate: boolean; paidById: string }, myId: string | undefined): boolean {
  return e.isPrivate && e.paidById !== myId;
}
