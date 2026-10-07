'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatCents } from '@/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/components/groups/stats-charts';
import { BudgetBar } from '@/components/groups/stats-extras';

export type ForecastConfig = {
  tripStart: string | Date | null;
  tripEnd: string | Date | null;
  foodPerDay: number | null;
  transportPerDay: number | null;
  otherPerDay: number | null;
};

export type ActualPoint = { date: string; value: number; category?: string | null };

const FOOD_CATEGORIES = new Set(['essen', 'food', 'getränke', 'drinks']);
const TRANSPORT_CATEGORIES = new Set(['transport', 'fahrtkosten', 'fahrt', 'taxi']);
/** How many of the most recent days the trend forecast looks at. */
const TREND_DAYS = 5;

type Trend = {
  windowDays: number;
  foodPerDay: number;
  transportPerDay: number;
  /** Still to come per category: rest of today (up to the daily average) plus every later trip day. */
  food: number;
  transport: number;
  /** Expected additional spending on a given day (UTC midnight), for the chart. */
  step: (day: number) => number;
};

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function localToday(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * Forecast from recent behaviour: the average daily food and transport spending of the last few
 * days (before today, or today itself on the first day) carried over to the days still ahead.
 */
function computeTrend(actual: ActualPoint[], startDay: number, endDay: number, today: number): Trend | null {
  const last = Math.min(today, endDay);
  if (last < startDay) return null;
  const windowEnd = last > startDay ? last - DAY_MS : last;
  const windowStart = Math.max(startDay, windowEnd - (TREND_DAYS - 1) * DAY_MS);
  const windowDays = Math.round((windowEnd - windowStart) / DAY_MS) + 1;

  let food = 0;
  let transport = 0;
  let todayFood = 0;
  let todayTransport = 0;
  for (const a of actual) {
    const cat = (a.category ?? '').trim().toLowerCase();
    const isFood = FOOD_CATEGORIES.has(cat);
    const isTransport = TRANSPORT_CATEGORIES.has(cat);
    if (!isFood && !isTransport) continue;
    const day = utcDay(new Date(a.date));
    if (day === today) {
      if (isFood) todayFood += a.value;
      else todayTransport += a.value;
    }
    if (day < windowStart || day > windowEnd) continue;
    if (isFood) food += a.value;
    else transport += a.value;
  }
  if (food + transport <= 0) return null;

  const foodPerDay = Math.round(food / windowDays);
  const transportPerDay = Math.round(transport / windowDays);
  const todayInTrip = today >= startDay && today <= endDay;
  const futureDays = today >= endDay ? 0 : Math.round((endDay - Math.max(today, startDay - DAY_MS)) / DAY_MS);
  const foodToday = todayInTrip ? Math.max(0, foodPerDay - todayFood) : 0;
  const transportToday = todayInTrip ? Math.max(0, transportPerDay - todayTransport) : 0;

  return {
    windowDays,
    foodPerDay,
    transportPerDay,
    food: foodToday + foodPerDay * futureDays,
    transport: transportToday + transportPerDay * futureDays,
    step: (day) => {
      if (day < startDay || day > endDay || day < today) return 0;
      if (day === today) return foodToday + transportToday;
      return foodPerDay + transportPerDay;
    },
  };
}

/** Dashed forecast over the remaining days, solid line for what is already spent, vertical line for today. */
function ForecastChart({
  actual,
  startDay,
  endDay,
  today,
  dailyExpected,
  trendStep,
  budget,
  currency,
  locale,
  todayLabel,
  budgetLabel,
}: {
  actual: ActualPoint[];
  startDay: number;
  endDay: number;
  today: number;
  dailyExpected: number;
  trendStep: ((day: number) => number) | null;
  budget: number | null;
  currency: string;
  locale: string;
  todayLabel: string;
  budgetLabel: string;
}) {
  const W = 600;
  const H = 230;
  const pad = { l: 48, r: 12, t: 16, b: 28 };

  // Cumulative spending per day
  const perDay = new Map<number, number>();
  for (const a of actual) {
    const day = utcDay(new Date(a.date));
    perDay.set(day, (perDay.get(day) ?? 0) + a.value);
  }
  const firstActual = perDay.size > 0 ? Math.min(...perDay.keys()) : startDay;
  const from = Math.min(firstActual, startDay, today);
  const to = Math.max(endDay, today);
  const span = Math.max(1, Math.round((to - from) / DAY_MS));

  const actualPts: { day: number; v: number }[] = [];
  let cum = 0;
  const lastActualDay = Math.min(today, to);
  for (let d = from; d <= lastActualDay; d += DAY_MS) {
    cum += perDay.get(d) ?? 0;
    actualPts.push({ day: d, v: cum });
  }
  // Expenses dated after today (pre-booked) still count towards the line's end
  for (const [d, v] of perDay) if (d > lastActualDay) cum += v;
  const spentNow = cum;

  // Starts where the solid line ends; every remaining trip day (today included) adds the expected daily costs
  const forecastPts: { day: number; v: number }[] = [{ day: lastActualDay, v: spentNow }];
  let f = spentNow;
  for (let d = lastActualDay; d <= to; d += DAY_MS) {
    if (d >= startDay && d <= endDay) f += dailyExpected;
    forecastPts.push({ day: d, v: f });
  }

  // Forecast from the last days: same start, but only what the recent food and transport spending suggests
  const trendPts: { day: number; v: number }[] = [];
  if (trendStep) {
    let tv = spentNow;
    trendPts.push({ day: lastActualDay, v: tv });
    for (let d = lastActualDay; d <= to; d += DAY_MS) {
      tv += trendStep(d);
      trendPts.push({ day: d, v: tv });
    }
  }

  const maxV = Math.max(1, spentNow, budget ?? 0, ...forecastPts.map((p) => p.v), ...trendPts.map((p) => p.v));
  const x = (day: number) => pad.l + ((day - from) / DAY_MS / span) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxV) * (H - pad.t - pad.b);
  const path = (pts: { day: number; v: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  const money = (c: number) => formatCents(c, currency, locale);
  const dateLabel = (day: number) =>
    new Date(day).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  const yTicks = [0, 0.5, 1].map((r) => r * maxV);
  const xTicks = [from, ...(today > from && today < to ? [today] : []), to];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="forecast chart">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth="1" />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground" fontSize="10">
            {formatCents(Math.round(v), currency, locale).replace(/[,.]00(?=\D*$)/, '')}
          </text>
        </g>
      ))}
      {xTicks.map((d) => (
        <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
          {dateLabel(d)}
        </text>
      ))}
      {today >= from && today <= to && (
        <g>
          <line
            x1={x(today)}
            x2={x(today)}
            y1={pad.t - 6}
            y2={H - pad.b}
            className="stroke-muted-foreground"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <text
            x={x(today)}
            y={pad.t - 6}
            textAnchor="middle"
            className="fill-foreground"
            fontSize="10"
            fontWeight="600"
          >
            {todayLabel}
          </text>
        </g>
      )}
      {budget !== null && (
        <g>
          <line
            x1={pad.l}
            x2={W - pad.r}
            y1={y(budget)}
            y2={y(budget)}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          <text x={pad.l + 4} y={y(budget) - 4} fontSize="10" fill="#ef4444">
            {budgetLabel} {money(budget)}
          </text>
        </g>
      )}
      <path d={path(actualPts)} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2.5" strokeLinejoin="round" />
      <path
        d={path(forecastPts)}
        fill="none"
        stroke={CHART_COLORS[1]}
        strokeWidth="2.5"
        strokeDasharray="6 5"
        strokeLinejoin="round"
      />
      {trendPts.length > 0 && (
        <g>
          <path
            d={path(trendPts)}
            fill="none"
            stroke={CHART_COLORS[2]}
            strokeWidth="2.5"
            strokeDasharray="2 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {(() => {
            const last = trendPts[trendPts.length - 1]!;
            return (
              <>
                <circle cx={x(last.day)} cy={y(last.v)} r="3.5" fill={CHART_COLORS[2]} />
                <text
                  x={x(last.day) - 4}
                  y={y(last.v) + 16}
                  textAnchor="end"
                  className="fill-foreground"
                  fontSize="11"
                  fontWeight="600"
                >
                  {money(last.v)}
                </text>
              </>
            );
          })()}
        </g>
      )}
      {forecastPts.length > 0 && (
        <g>
          {(() => {
            const last = forecastPts[forecastPts.length - 1]!;
            return (
              <>
                <circle cx={x(last.day)} cy={y(last.v)} r="3.5" fill={CHART_COLORS[1]} />
                <text
                  x={x(last.day) - 4}
                  y={y(last.v) - 8}
                  textAnchor="end"
                  className="fill-foreground"
                  fontSize="11"
                  fontWeight="600"
                >
                  {money(last.v)}
                </text>
              </>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

/**
 * Forecast = what is already booked/spent + what is still expected.
 * Expected costs are per person and day (food, local transport, other) for every trip day still ahead
 * (today included).
 */
export function ForecastCard({
  groupId,
  config,
  actual,
  spent,
  people,
  scope,
  budget = null,
  currency,
  locale,
}: {
  groupId: string;
  config: ForecastConfig;
  actual: ActualPoint[];
  spent: number;
  people: number;
  scope: 'group' | 'me';
  budget?: number | null;
  currency: string;
  locale: string;
}) {
  const t = useTranslations('groups');
  const money = (c: number) => formatCents(c, currency, locale);

  const hasCosts = !!(config.foodPerDay || config.transportPerDay || config.otherPerDay);
  if (!config.tripStart || !config.tripEnd || !hasCosts) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('stats.forecast')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {budget !== null && (
            <BudgetBar budget={budget} spent={spent} forecast={spent} currency={currency} locale={locale} />
          )}
          <p>{t('stats.forecastNone')}</p>
          <Link href={`/groups/${groupId}/settings`} className="text-primary hover:underline">
            {t('stats.forecastSettings')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const startDay = utcDay(new Date(config.tripStart));
  const endDay = utcDay(new Date(config.tripEnd));
  const today = localToday();
  const totalDays = Math.max(1, Math.round((endDay - startDay) / DAY_MS) + 1);
  const daysLeft = today > endDay ? 0 : today < startDay ? totalDays : Math.round((endDay - today) / DAY_MS) + 1;

  const headcount = scope === 'group' ? people : 1;
  const food = (config.foodPerDay ?? 0) * headcount * daysLeft;
  const transport = (config.transportPerDay ?? 0) * headcount * daysLeft;
  const other = (config.otherPerDay ?? 0) * headcount * daysLeft;
  const total = spent + food + transport + other;
  const dailyExpected =
    ((config.foodPerDay ?? 0) + (config.transportPerDay ?? 0) + (config.otherPerDay ?? 0)) * headcount;

  const trend = daysLeft > 0 ? computeTrend(actual, startDay, endDay, today) : null;
  const trendTotal = trend ? spent + trend.food + trend.transport : null;

  const detail = (perDay: number | null) => ({ perDay: money(perDay ?? 0), people: headcount, days: daysLeft });
  const rows = [
    { label: t('stats.forecastSoFar'), value: spent, color: CHART_COLORS[0] },
    { label: t('stats.forecastFood', detail(config.foodPerDay)), value: food, color: CHART_COLORS[1] },
    { label: t('stats.forecastTransport', detail(config.transportPerDay)), value: transport, color: CHART_COLORS[2] },
    { label: t('stats.forecastOther', detail(config.otherPerDay)), value: other, color: CHART_COLORS[3] },
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
        <ForecastChart
          actual={actual}
          startDay={startDay}
          endDay={endDay}
          today={today}
          dailyExpected={dailyExpected}
          trendStep={trend ? trend.step : null}
          budget={budget}
          currency={currency}
          locale={locale}
          todayLabel={t('stats.today')}
          budgetLabel={t('stats.budget')}
        />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ backgroundColor: CHART_COLORS[0] }} />
            {t('stats.forecastActual')}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${CHART_COLORS[1]} 0 5px, transparent 5px 9px)`,
              }}
            />
            {t('stats.forecast')}
          </span>
          {trend && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-5"
                style={{
                  backgroundImage: `repeating-linear-gradient(90deg, ${CHART_COLORS[2]} 0 2px, transparent 2px 6px)`,
                }}
              />
              {t('stats.trendShort')}
            </span>
          )}
        </div>
        {budget !== null && (
          <BudgetBar budget={budget} spent={spent} forecast={total} currency={currency} locale={locale} />
        )}
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
        {trend && trendTotal !== null && (
          <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="trend-forecast">
            <p className="text-sm font-semibold">{t('stats.trendTitle', { days: trend.windowDays })}</p>
            <p className="text-xs text-muted-foreground">{t('stats.trendHint')}</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: CHART_COLORS[0] }} />
                <span className="min-w-0 flex-1">{t('stats.forecastSoFar')}</span>
                <span className="font-medium tabular-nums">{money(spent)}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: CHART_COLORS[2] }} />
                <span className="min-w-0 flex-1">
                  {t('stats.trendFood', { perDay: money(trend.foodPerDay), days: daysLeft })}
                </span>
                <span className="font-medium tabular-nums">{money(trend.food)}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: CHART_COLORS[2] }} />
                <span className="min-w-0 flex-1">
                  {t('stats.trendTransport', { perDay: money(trend.transportPerDay), days: daysLeft })}
                </span>
                <span className="font-medium tabular-nums">{money(trend.transport)}</span>
              </li>
            </ul>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="font-semibold">{t('stats.trendTotal')}</span>
              <span className="text-lg font-bold tabular-nums">{money(trendTotal)}</span>
            </div>
            {scope === 'group' && people > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{t('stats.forecastPerPerson')}</span>
                <span className="font-medium tabular-nums">{money(Math.round(trendTotal / people))}</span>
              </div>
            )}
          </div>
        )}
        <Link href={`/groups/${groupId}/settings`} className="text-xs text-primary hover:underline">
          {t('stats.forecastSettings')}
        </Link>
      </CardContent>
    </Card>
  );
}
