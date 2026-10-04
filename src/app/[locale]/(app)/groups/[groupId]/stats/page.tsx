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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ForecastCard } from '@/components/groups/forecast-card';
import { DailyPlanCard, RecapCard, type Recap } from '@/components/groups/stats-extras';
import { ExpenseMap, type MapPoint } from '@/components/groups/expense-map';
import {
  BalanceBars,
  CHART_COLORS,
  DonutChart,
  PairBars,
  TimeBars,
  type Bucket,
  type Slice,
} from '@/components/groups/stats-charts';

type Scope = 'group' | 'me';

const FOOD_CATEGORIES = new Set(['essen', 'food', 'getränke', 'drinks']);
const MAX_CATEGORY_SLICES = 8;
const DAY_MS = 86_400_000;

export default function GroupStatsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const locale = useLocale();
  const t = useTranslations('groups');
  const { data: authSession } = useSession();
  const myId = authSession?.user?.id;
  const [scope, setScope] = useState<Scope>('group');

  const group = trpc.groups.get.useQuery({ groupId });
  const stats = trpc.expenses.stats.useQuery({ groupId });
  const balances = trpc.balances.getGroupBalances.useQuery({ groupId });

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
    const catLabel = (c: string | null) => (c ? c.charAt(0).toUpperCase() + c.slice(1) : t('stats.noCategory'));

    const byCategory = new Map<string, number>();
    for (const e of scoped) byCategory.set(catLabel(e.category), (byCategory.get(catLabel(e.category)) ?? 0) + e.value);
    const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const topLabels = ranked.slice(0, MAX_CATEGORY_SLICES).map(([label]) => label);
    const otherValue = ranked.slice(MAX_CATEGORY_SLICES).reduce((a, [, v]) => a + v, 0);
    const categories: Slice[] = [
      ...ranked.slice(0, MAX_CATEGORY_SLICES).map(([label, value]) => ({
        label,
        value,
        icon: label !== t('stats.noCategory'),
      })),
      ...(otherValue > 0 ? [{ label: t('stats.other'), value: otherValue }] : []),
    ];
    const colorOf = new Map<string, string>(categories.map((c, i) => [c.label, CHART_COLORS[i % CHART_COLORS.length]!]));
    const partKey = (c: string | null) => (topLabels.includes(catLabel(c)) ? catLabel(c) : t('stats.other'));

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
    const bucketMap = new Map<string, Map<string, number>>();
    for (const e of scoped) {
      const key = monthly ? e.date.slice(0, 7) : e.date.slice(0, 10);
      const parts = bucketMap.get(key) ?? new Map<string, number>();
      const pk = partKey(e.category);
      parts.set(pk, (parts.get(pk) ?? 0) + e.value);
      bucketMap.set(key, parts);
    }
    const order = categories.map((c) => c.label);
    const timeline: Bucket[] = [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, parts]) => {
        const d = new Date(key.length === 7 ? `${key}-01T12:00:00Z` : `${key}T12:00:00Z`);
        const label = d.toLocaleDateString(
          locale,
          monthly
            ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
            : { day: '2-digit', month: '2-digit', timeZone: 'UTC' },
        );
        return {
          label,
          parts: order.filter((k) => parts.has(k)).map((k) => ({ key: k, value: parts.get(k) ?? 0 })),
        };
      });

    let spanDays = 1;
    const first = scoped[0];
    const last = scoped[scoped.length - 1];
    if (first && last) {
      spanDays = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / DAY_MS) + 1);
    }

    const biggest = [...scoped].sort((a, b) => b.value - a.value).slice(0, 5);
    const actual = scoped.map((e) => ({ date: e.date, value: e.value }));
    const foodSpent = scoped
      .filter((e) => FOOD_CATEGORIES.has((e.category ?? '').toLowerCase()))
      .reduce((a, e) => a + e.value, 0);

    const mapPoints: { id: string; title: string; amount: number; lat: number; lon: number }[] = [];
    for (const e of rows) {
      if (e.latitude === null || e.longitude === null) continue;
      mapPoints.push({
        id: e.id,
        title: e.placeName ? `${e.title} · ${e.placeName}` : e.title,
        amount: e.amount,
        lat: e.latitude,
        lon: e.longitude,
      });
    }

    return { actual, total, count: scoped.length, categories, colorOf, perPerson, timeline, spanDays, biggest, foodSpent, mapPoints, scoped };
  }, [stats.data, scope, myId, locale, t]);

  if ((group.isLoading || stats.isLoading) && !group.isError) return <LoadingSpinner />;
  if (!group.data) return null;

  const g = group.data;
  const people = g.members.length;
  const nameOf = (userId: string) => {
    const m = g.members.find((x) => x.user.id === userId)?.user;
    return m?.placeholderName ?? m?.name ?? m?.email ?? t('detail.unknown');
  };
  const money = (cents: number) => formatCents(cents, g.currency, locale);

  const peopleRows = [...view.perPerson.entries()]
    .map(([userId, v]) => ({ label: nameOf(userId), a: v.paid, b: v.share }))
    .sort((x, y) => y.a - x.a);

  const balanceRows = (balances.data?.balances ?? [])
    .map((b) => ({ label: nameOf(b.userId), net: b.net }))
    .sort((x, y) => y.net - x.net);

  // Trip / daily plan
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOf = (d: string | Date) => {
    const x = new Date(d);
    return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  };
  const hasTrip = !!(g.tripStart && g.tripEnd);
  const elapsedDays =
    g.tripStart && g.tripEnd && today >= dayOf(g.tripStart)
      ? Math.round((Math.min(today, dayOf(g.tripEnd)) - dayOf(g.tripStart)) / DAY_MS) + 1
      : 0;
  const headcount = scope === 'group' ? people : 1;
  const budget =
    g.budgetTotal !== null && g.budgetTotal > 0
      ? scope === 'group'
        ? g.budgetTotal
        : Math.round(g.budgetTotal / Math.max(1, people))
      : null;

  // Recap
  const dayTotals = new Map<string, { value: number; count: number }>();
  for (const e of view.scoped) {
    const key = e.date.slice(0, 10);
    const cur = dayTotals.get(key) ?? { value: 0, count: 0 };
    cur.value += e.value;
    cur.count += 1;
    dayTotals.set(key, cur);
  }
  const dayLabel = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const priciest = [...dayTotals.entries()].sort((a, b) => b[1].value - a[1].value)[0];
  const busiest = [...dayTotals.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const topCat = view.categories.find((c) => c.label !== t('stats.other'));
  const topPayer = [...view.perPerson.entries()].sort((a, b) => b[1].paid - a[1].paid)[0];
  const bigOne = view.biggest[0];
  const recap: Recap = {
    priciestDay: priciest ? { label: dayLabel(priciest[0]), value: priciest[1].value } : null,
    topCategory: topCat ? { label: topCat.label, value: topCat.value } : null,
    topPayer: topPayer ? { label: nameOf(topPayer[0]), value: topPayer[1].paid } : null,
    biggest: bigOne ? { label: bigOne.title, value: bigOne.value } : null,
    busiestDay: busiest && busiest[1].count > 1 ? { label: dayLabel(busiest[0]), count: busiest[1].count } : null,
    perPerson: scope === 'group' ? Math.round(view.total / Math.max(1, people)) : view.total,
  };

  const mapPoints: MapPoint[] = view.mapPoints.map((p) => ({ ...p, amount: money(p.amount) }));

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
              transportPerDay: g.forecastTransport,
              otherPerDay: g.forecastOther,
            }}
            actual={view.actual}
            spent={view.total}
            people={people}
            scope={scope}
            budget={budget}
            currency={g.currency}
            locale={locale}
          />

          {hasTrip && g.forecastFoodPerDay ? (
            <DailyPlanCard
              spent={view.foodSpent}
              headcount={headcount}
              elapsedDays={elapsedDays}
              plannedPerDay={g.forecastFoodPerDay}
              currency={g.currency}
              locale={locale}
            />
          ) : null}

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
            <CardContent className="space-y-3">
              <TimeBars buckets={view.timeline} colors={view.colorOf} currency={g.currency} locale={locale} />
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {view.categories.map((c) => (
                  <li key={c.label} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: view.colorOf.get(c.label) }} />
                    {c.icon ? categoryIcon(c.label) : ''} {c.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('stats.byPerson')}</CardTitle>
            </CardHeader>
            <CardContent>
              <PairBars
                rows={peopleRows}
                aLabel={t('stats.paid')}
                bLabel={t('stats.share')}
                currency={g.currency}
                locale={locale}
              />
            </CardContent>
          </Card>

          {balanceRows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('stats.balances')}</CardTitle>
              </CardHeader>
              <CardContent>
                <BalanceBars rows={balanceRows} currency={g.currency} locale={locale} />
              </CardContent>
            </Card>
          )}

          {mapPoints.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('stats.map')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ExpenseMap points={mapPoints} errorText={t('stats.mapFailed')} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{t('stats.biggest')}</span>
                <Link href={`/groups/${groupId}/expenses`} className="text-xs font-normal text-primary hover:underline">
                  {t('stats.allExpenses')}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {view.biggest.map((e) => (
                <Link
                  key={e.id}
                  href={`/groups/${groupId}/expenses/${e.id}`}
                  className="flex items-center justify-between py-2 text-sm hover:text-primary"
                >
                  <span className="truncate">
                    {categoryIcon(e.category)} {e.title}
                    <span className="ml-2 text-muted-foreground">{nameOf(e.paidById)}</span>
                  </span>
                  <span className="ml-3 shrink-0 font-semibold tabular-nums">{money(e.value)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          <RecapCard recap={recap} currency={g.currency} locale={locale} />
        </>
      )}
    </div>
  );
}
