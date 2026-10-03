'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/components/groups/stats-charts';

export type ForecastConfig = {
  tripStart: string | Date | null;
  tripEnd: string | Date | null;
  foodPerDay: number | null;
  transport: number | null;
  other: number | null;
};

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Forecast = what is already booked/spent + what is still expected.
 * Expected food = food per person and day for every trip day that is still ahead (today included).
 * Transport and other are one-off amounts for the whole group that are still to come.
 */
export function ForecastCard({
  groupId,
  config,
  spent,
  people,
  scope,
  currency,
  locale,
}: {
  groupId: string;
  config: ForecastConfig;
  spent: number;
  people: number;
  scope: 'group' | 'me';
  currency: string;
  locale: string;
}) {
  const t = useTranslations('groups');
  const money = (c: number) => formatCents(c, currency, locale);

  const hasCosts = !!(config.foodPerDay || config.transport || config.other);
  if (!config.tripStart || !config.tripEnd || !hasCosts) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('stats.forecast')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{t('stats.forecastNone')}</p>
          <Link href={`/groups/${groupId}/settings`} className="text-primary hover:underline">
            {t('stats.forecastSettings')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const start = new Date(config.tripStart);
  const end = new Date(config.tripEnd);
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const today = startOfDay(new Date());
  const totalDays = Math.max(1, Math.round((endDay - startDay) / DAY_MS) + 1);
  const daysLeft = today > endDay ? 0 : today < startDay ? totalDays : Math.round((endDay - today) / DAY_MS) + 1;

  const headcount = scope === 'group' ? people : 1;
  const food = (config.foodPerDay ?? 0) * headcount * daysLeft;
  const transport = scope === 'group' ? (config.transport ?? 0) : Math.round((config.transport ?? 0) / Math.max(1, people));
  const other = scope === 'group' ? (config.other ?? 0) : Math.round((config.other ?? 0) / Math.max(1, people));
  const expected = food + transport + other;
  const total = spent + expected;

  const rows = [
    { label: t('stats.forecastSoFar'), value: spent, color: CHART_COLORS[0] },
    {
      label: t('stats.forecastFood', {
        perDay: money(config.foodPerDay ?? 0),
        people: headcount,
        days: daysLeft,
      }),
      value: food,
      color: CHART_COLORS[1],
    },
    { label: t('stats.forecastTransport'), value: transport, color: CHART_COLORS[2] },
    { label: t('stats.forecastOther'), value: other, color: CHART_COLORS[3] },
  ].filter((r) => r.value > 0 || r.color === CHART_COLORS[0]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{t('stats.forecast')}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t('stats.forecastDaysLeft', { days: daysLeft, total: totalDays })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          {rows.map((r) => (
            <div
              key={r.label}
              title={`${r.label}: ${money(r.value)}`}
              style={{ width: `${total > 0 ? (r.value / total) * 100 : 0}%`, backgroundColor: r.color }}
            />
          ))}
        </div>
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
              <span className="min-w-0 flex-1">{r.label}</span>
              <span className="font-medium tabular-nums">{money(r.value)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-semibold">{t('stats.forecastTotal')}</span>
          <span className="text-xl font-bold tabular-nums">{money(total)}</span>
        </div>
        {scope === 'group' && people > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t('stats.forecastPerPerson')}</span>
            <span className="font-medium tabular-nums">{money(Math.round(total / people))}</span>
          </div>
        )}
        <Link href={`/groups/${groupId}/settings`} className="text-xs text-primary hover:underline">
          {t('stats.forecastSettings')}
        </Link>
      </CardContent>
    </Card>
  );
}
