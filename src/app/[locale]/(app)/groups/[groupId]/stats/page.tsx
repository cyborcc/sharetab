'use client';

import { use, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatCents } from '@/lib/money';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ForecastCard } from '@/components/groups/forecast-card';
import { DonutChart, PairBars, TimeBars, type Slice } from '@/components/groups/stats-charts';

type Scope = 'group' | 'me';

export default function GroupStatsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const locale = useLocale();
  const t = useTranslations('groups');
  const { data: authSession } = useSession();
  const myId = authSession?.user?.id;
  const [scope, setScope] = useState<Scope>('group');

  const group = trpc.groups.get.useQuery({ groupId });
  const stats = trpc.expenses.stats.useQuery({ groupId });

  const view = useMemo(() => {
    const rows = stats.data ?? [];
    // Betrag je Ausgabe aus Sicht des gewaehlten Umfangs (ganze Gruppe oder nur mein Anteil)
    const scoped = rows
      .map((e) => ({
        ...e,
        value:
          scope === 'group' ? e.amount : e.shares.filter((sh) => sh.userId === myId).reduce((a, sh) => a + sh.amount, 0),
      }))
      .filter((e) => e.value > 0);

    const total = scoped.reduce((a, e) => a + e.value, 0);

    const byCategory = new Map<string, number>();
    for (const e of scoped) {
      const key = e.category ? e.category.charAt(0).toUpperCase() + e.category.slice(1) : '';
      byCategory.set(key, (byCategory.get(key) ?? 0) + e.value);
    }
    const categories: Slice[] = [...byCategory.entries()]
      .map(([label, value]) => ({ label: label || t('stats.noCategory'), value, icon: label !== '' }))
      .sort((a, b) => b.value - a.value);

    const perPerson = new Map<string, { paid: number; share: number }>();
    for (const e of rows) {
      const payer = perPerson.get(e.paidById) ?? { paid: 0, share: 0 };
      payer.paid += e.amount;
      perPerson.set(e.paidById, payer);
      for (const sh of e.shares) {
        const p = perPerson.get(sh.userId) ?? { paid: 0, share: 0 };
        p.share += sh.amount;
        perPerson.set(sh.userId, p);
      }
    }

    const days = new Set(scoped.map((e) => e.date.slice(0, 10)));
    const monthly = days.size > 31;
    const buckets = new Map<string, number>();
    for (const e of scoped) {
      const key = monthly ? e.date.slice(0, 7) : e.date.slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + e.value);
    }
    const timeline = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        const d = new Date(key.length === 7 ? `${key}-01T12:00:00Z` : `${key}T12:00:00Z`);
        const label = d.toLocaleDateString(
          locale,
          monthly
            ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
            : { day: '2-digit', month: '2-digit', timeZone: 'UTC' },
        );
        return { label, value };
      });

    let spanDays = 1;
    const first = scoped[0];
    const last = scoped[scoped.length - 1];
    if (first && last) {
      spanDays = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000) + 1);
    }

    const biggest = [...scoped].sort((a, b) => b.value - a.value).slice(0, 5);

    return { total, count: scoped.length, categories, perPerson, timeline, spanDays, biggest };
  }, [stats.data, scope, myId, locale, t]);

  if ((group.isLoading || stats.isLoading) && !group.isError) return <LoadingSpinner />;
  if (!group.data) return null;

  const g = group.data;
  const nameOf = (userId: string) => {
    const m = g.members.find((x) => x.user.id === userId)?.user;
    return m?.placeholderName ?? m?.name ?? m?.email ?? t('detail.unknown');
  };
  const money = (cents: number) => formatCents(cents, g.currency, locale);

  const people = [...view.perPerson.entries()]
    .map(([userId, v]) => ({ label: nameOf(userId), a: v.paid, b: v.share }))
    .sort((x, y) => y.a - x.a);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/groups/${groupId}`} />}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">
            {g.emoji} {g.name} · {t('stats.title')}
          </h1>
        </div>
        <div className="inline-flex rounded-lg border p-0.5 text-sm">
          {(['group', 'me'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1 transition-colors ${
                scope === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'group' ? t('stats.scopeGroup') : t('stats.scopeMe')}
            </button>
          ))}
        </div>
      </div>

      {view.count === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t('stats.empty')}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t('stats.total'), value: money(view.total) },
              { label: t('stats.count'), value: String(view.count) },
              { label: t('stats.avgPerExpense'), value: money(Math.round(view.total / view.count)) },
              { label: t('stats.perDay'), value: money(Math.round(view.total / view.spanDays)) },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="py-4">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-bold tabular-nums">{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <ForecastCard
            groupId={groupId}
            config={{
              tripStart: g.tripStart,
              tripEnd: g.tripEnd,
              foodPerDay: g.forecastFoodPerDay,
              transport: g.forecastTransport,
              other: g.forecastOther,
            }}
            spent={view.total}
            people={g.members.length}
            scope={scope}
            currency={g.currency}
            locale={locale}
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('stats.byCategory')}</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart slices={view.categories} currency={g.currency} locale={locale} centerLabel={t('stats.total')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('stats.overTime')}</CardTitle>
            </CardHeader>
            <CardContent>
              <TimeBars buckets={view.timeline} currency={g.currency} locale={locale} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('stats.byPerson')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PairBars
                rows={people}
                aLabel={t('stats.paid')}
                bLabel={t('stats.share')}
                currency={g.currency}
                locale={locale}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('stats.biggest')}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {view.biggest.map((e) => (
                <Link
                  key={e.id}
                  href={`/groups/${groupId}/expenses/${e.id}`}
                  className="flex items-center justify-between py-2 text-sm hover:text-primary"
                >
                  <span className="truncate">
                    {e.title}
                    <span className="ml-2 text-muted-foreground">{nameOf(e.paidById)}</span>
                  </span>
                  <span className="ml-3 shrink-0 font-semibold tabular-nums">{money(e.value)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
