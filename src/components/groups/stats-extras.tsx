'use client';

import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';
import { categoryIcon } from '@/lib/categories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/components/groups/stats-charts';

/** Real average per person and day against the planned daily value (food and drinks). */
export function DailyPlanCard({
  spent,
  headcount,
  elapsedDays,
  plannedPerDay,
  currency,
  locale,
}: {
  spent: number;
  headcount: number;
  elapsedDays: number;
  plannedPerDay: number;
  currency: string;
  locale: string;
}) {
  const t = useTranslations('groups');
  const money = (c: number) => formatCents(c, currency, locale);
  const started = elapsedDays > 0;
  const real = started ? Math.round(spent / Math.max(1, headcount) / elapsedDays) : 0;
  const ratio = plannedPerDay > 0 ? real / plannedPerDay : 0;
  const over = real > plannedPerDay;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('stats.dailyPlan')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {started ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{t('stats.dailyReal')}</p>
                <p className={`text-xl font-bold tabular-nums ${over ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {money(real)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t('stats.dailyPlanned')}</p>
                <p className="text-xl font-bold tabular-nums">{money(plannedPerDay)}</p>
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, ratio * 100)}%`,
                  backgroundColor: over ? '#ef4444' : '#10b981',
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t(over ? 'stats.dailyOver' : 'stats.dailyUnder', { diff: money(Math.abs(real - plannedPerDay)) })}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('stats.dailyNotStarted', { plan: money(plannedPerDay) })}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Budget progress: spent and forecast against the limit. */
export function BudgetBar({
  budget,
  spent,
  forecast,
  currency,
  locale,
}: {
  budget: number;
  spent: number;
  forecast: number;
  currency: string;
  locale: string;
}) {
  const t = useTranslations('groups');
  const money = (c: number) => formatCents(c, currency, locale);
  const max = Math.max(budget, forecast, spent, 1);
  const diff = budget - forecast;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t('stats.budget')}</span>
        <span className="tabular-nums text-muted-foreground">
          {money(spent)} / {money(budget)}
        </span>
      </div>
      <div className="relative h-3 rounded-full bg-muted">
        <div
          className="absolute top-0 bottom-0 rounded-full opacity-40"
          style={{ width: `${(forecast / max) * 100}%`, backgroundColor: forecast > budget ? '#ef4444' : CHART_COLORS[1] }}
        />
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{ width: `${(spent / max) * 100}%`, backgroundColor: spent > budget ? '#ef4444' : CHART_COLORS[0] }}
        />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-foreground" style={{ left: `${(budget / max) * 100}%` }} />
      </div>
      <p className={`text-xs ${diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
        {t(diff < 0 ? 'stats.budgetOver' : 'stats.budgetUnder', { diff: money(Math.abs(diff)) })}
      </p>
    </div>
  );
}

export type Recap = {
  priciestDay: { label: string; value: number } | null;
  topCategory: { label: string; value: number } | null;
  topPayer: { label: string; value: number } | null;
  biggest: { label: string; value: number } | null;
  busiestDay: { label: string; count: number } | null;
  perPerson: number;
};

/** Highlights for the end of the trip. */
export function RecapCard({ recap, currency, locale }: { recap: Recap; currency: string; locale: string }) {
  const t = useTranslations('groups');
  const money = (c: number) => formatCents(c, currency, locale);
  const tiles = [
    recap.priciestDay && { icon: '📅', title: t('stats.recapPriciestDay'), main: recap.priciestDay.label, sub: money(recap.priciestDay.value) },
    recap.topCategory && {
      icon: categoryIcon(recap.topCategory.label),
      title: t('stats.recapTopCategory'),
      main: recap.topCategory.label,
      sub: money(recap.topCategory.value),
    },
    recap.topPayer && { icon: '💳', title: t('stats.recapTopPayer'), main: recap.topPayer.label, sub: money(recap.topPayer.value) },
    recap.biggest && { icon: '💸', title: t('stats.recapBiggest'), main: recap.biggest.label, sub: money(recap.biggest.value) },
    recap.busiestDay && {
      icon: '🧾',
      title: t('stats.recapBusiestDay'),
      main: recap.busiestDay.label,
      sub: t('stats.recapCount', { count: recap.busiestDay.count }),
    },
    { icon: '👤', title: t('stats.recapPerPerson'), main: money(recap.perPerson), sub: '' },
  ].filter((x): x is { icon: string; title: string; main: string; sub: string } => !!x);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('stats.recap')}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.title} className="rounded-lg border p-3">
            <p className="text-xl">{tile.icon}</p>
            <p className="mt-1 text-xs text-muted-foreground">{tile.title}</p>
            <p className="truncate font-semibold">{tile.main}</p>
            {tile.sub && <p className="text-sm tabular-nums text-muted-foreground">{tile.sub}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
