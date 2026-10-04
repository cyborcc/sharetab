'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { BarChart3 } from 'lucide-react';
import { formatCents } from '@/lib/money';
import { categoryIcon } from '@/lib/categories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetBar } from '@/components/groups/stats-extras';
import { CHART_COLORS } from '@/components/groups/stats-charts';

type Totals = {
  paid: number;
  share: number;
  total: number;
  categories: { category: string | null; amount: number }[];
};

/** "My spending" overview on the group page: paid, share, balance, split by category, budget. */
export function MySpendingCard({
  groupId,
  totals,
  budget,
  people,
  currency,
  locale,
}: {
  groupId: string;
  totals: Totals;
  budget: number | null;
  people: number;
  currency: string;
  locale: string;
}) {
  const t = useTranslations('groups');
  const money = (c: number) => formatCents(c, currency, locale);
  const net = totals.paid - totals.share;
  const sharePct = totals.total > 0 ? Math.round((totals.share / totals.total) * 100) : 0;

  const top = totals.categories.slice(0, 5);
  const restValue = totals.categories.slice(5).reduce((a, c) => a + c.amount, 0);
  const slices = [
    ...top.map((c) => ({ label: c.category ?? t('stats.noCategory'), icon: categoryIcon(c.category), value: c.amount })),
    ...(restValue > 0 ? [{ label: t('stats.other'), icon: '…', value: restValue }] : []),
  ];

  const tiles = [
    { icon: '💳', label: t('detail.myPaid'), value: money(totals.paid), sub: '' },
    { icon: '🧾', label: t('detail.myShare'), value: money(totals.share), sub: t('detail.myShareOfTotal', { pct: sharePct }) },
    { icon: '🌍', label: t('detail.myTotalAll'), value: money(totals.total), sub: '' },
    {
      icon: net >= 0 ? '⬆️' : '⬇️',
      label: t('detail.myBalance'),
      value: `${net > 0 ? '+' : ''}${money(net)}`,
      sub: net > 0 ? t('detail.myBalanceGet') : net < 0 ? t('detail.myBalanceOwe') : t('detail.myBalanceEven'),
      tone: net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-red-600 dark:text-red-400' : '',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t('detail.myTitle')}</CardTitle>
          <Link href={`/groups/${groupId}/stats`} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <BarChart3 className="h-3.5 w-3.5" />
            {t('detail.stats')}
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                <span className="mr-1">{tile.icon}</span>
                {tile.label}
              </p>
              <p className={`text-lg font-bold tabular-nums ${tile.tone ?? ''}`}>{tile.value}</p>
              {tile.sub && <p className="text-xs text-muted-foreground">{tile.sub}</p>}
            </div>
          ))}
        </div>

        {slices.length > 0 && totals.share > 0 && (
          <div className="space-y-2">
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {slices.map((s, i) => (
                <div
                  key={s.label}
                  title={`${s.label}: ${money(s.value)}`}
                  style={{ width: `${(s.value / totals.share) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {slices.map((s, i) => (
                <li key={s.label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {s.icon} {s.label} <span className="tabular-nums">{money(s.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {budget !== null && budget > 0 && (
          <BudgetBar
            budget={Math.round(budget / Math.max(1, people))}
            spent={totals.share}
            forecast={totals.share}
            currency={currency}
            locale={locale}
          />
        )}
      </CardContent>
    </Card>
  );
}
