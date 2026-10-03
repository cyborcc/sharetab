'use client';

import { formatCents } from '@/lib/money';

export const CHART_COLORS = [
  '#0ea5e9',
  '#f97316',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#eab308',
  '#ec4899',
  '#14b8a6',
  '#64748b',
];

export type Slice = { label: string; value: number };

export function DonutChart({
  slices,
  currency,
  locale,
  centerLabel,
}: {
  slices: Slice[];
  currency: string;
  locale: string;
  centerLabel: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let offset = 25;
  const segments = slices.map((s, i) => {
    const pct = total > 0 ? (s.value / total) * 100 : 0;
    const segment = { ...s, pct, dash: `${pct} ${100 - pct}`, offset, color: CHART_COLORS[i % CHART_COLORS.length] };
    offset -= pct;
    return segment;
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full" role="img" aria-label={centerLabel}>
          <circle cx="21" cy="21" r="15.9155" fill="none" className="stroke-muted" strokeWidth="6" />
          {segments.map((s) => (
            <circle
              key={s.label}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={s.color}
              strokeWidth="6"
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
          <span className="text-lg font-bold tabular-nums">{formatCents(total, currency, locale)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.pct.toFixed(0)} %</span>
            <span className="w-24 text-right font-medium tabular-nums">{formatCents(s.value, currency, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type PairRow = { label: string; a: number; b: number };

/** Horizontal paired bars, e.g. paid vs. own share per person. */
export function PairBars({
  rows,
  aLabel,
  bLabel,
  currency,
  locale,
}: {
  rows: PairRow[];
  aLabel: string;
  bLabel: string;
  currency: string;
  locale: string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[0] }} />
          {aLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[1] }} />
          {bLabel}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <p className="truncate text-sm font-medium">{r.label}</p>
          {[
            { v: r.a, color: CHART_COLORS[0] },
            { v: r.b, color: CHART_COLORS[1] },
          ].map((bar, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(bar.v / max) * 100}%`, backgroundColor: bar.color }}
                />
              </div>
              <span className="w-24 text-right text-xs tabular-nums">{formatCents(bar.v, currency, locale)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export type Bucket = { label: string; value: number };

/** Simple vertical bar chart (spending over time). */
export function TimeBars({ buckets, currency, locale }: { buckets: Bucket[]; currency: string; locale: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  return (
    <div className="flex h-48 items-end gap-1 overflow-x-auto pb-1">
      {buckets.map((b) => (
        <div key={b.label} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1">
          <div
            className="w-full rounded-t-md"
            style={{ height: `${Math.max(2, (b.value / max) * 85)}%`, backgroundColor: CHART_COLORS[0] }}
            title={`${b.label}: ${formatCents(b.value, currency, locale)}`}
          />
          <span className="text-[10px] text-muted-foreground">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
