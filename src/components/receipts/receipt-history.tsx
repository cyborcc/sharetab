'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { centsToDecimal, formatCents } from '@/lib/money';

type Entry = {
  id: string;
  type: string;
  createdAt: Date | string;
  userId: string | null;
  userName: string | null;
  metadata: Record<string, unknown>;
};
type Line = { name: string; quantity: number; totalPrice: number };
type Units = Record<string, number>; // userId -> units of a line
type Meta = {
  action?: 'update' | 'add' | 'delete' | 'split' | 'assign';
  itemId?: string;
  itemName?: string;
  before?: Line;
  after?: Line;
  quantity?: number;
  of?: number;
  changes?: { itemId: string; itemName: string; before: Units; after: Units }[] | Record<string, [unknown, unknown]>;
};

/** Scrolls a receipt line (rendered with id "item-<id>") into view. */
export function scrollToItem(itemId: string) {
  document.getElementById(`item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Who changed what on a receipt, newest first: edited, added, removed, split and reassigned lines,
 * and saving the expense. Lines that still exist are links that scroll to them.
 */
export function ReceiptHistory({
  entries,
  members,
  currency,
  existingItemIds,
  onShowItem,
}: {
  entries: Entry[];
  members: { id: string; name: string | null }[];
  currency: string;
  existingItemIds: Set<string>;
  onShowItem: (itemId: string) => void;
}) {
  const t = useTranslations('expenses.receipt');
  const locale = useLocale();
  if (entries.length === 0) return null;

  const money = (cents: number) => {
    try {
      return formatCents(cents, currency, locale);
    } catch {
      return `${centsToDecimal(cents)} ${currency}`;
    }
  };
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name?.split(' ')[0] ?? '?';
  const units = (u: Units) => {
    const parts = Object.entries(u).map(([id, n]) => (n > 1 ? `${nameOf(id)} ×${n}` : nameOf(id)));
    return parts.length > 0 ? parts.join(', ') : t('historyNobody');
  };
  const itemLink = (itemId: string | undefined, name: string | undefined) =>
    itemId && existingItemIds.has(itemId) ? (
      <button type="button" className="font-medium text-primary hover:underline" onClick={() => onShowItem(itemId)}>
        {name ?? '?'}
      </button>
    ) : (
      <span className="font-medium">{name ?? '?'}</span>
    );

  function lineDiff(before: Line, after: Line): string {
    const parts: string[] = [];
    if (before.name !== after.name) parts.push(`${t('historyName')} „${before.name}“ → „${after.name}“`);
    if (before.quantity !== after.quantity) parts.push(`${t('historyQty')} ${before.quantity} → ${after.quantity}`);
    if (before.totalPrice !== after.totalPrice)
      parts.push(`${t('historyPrice')} ${money(before.totalPrice)} → ${money(after.totalPrice)}`);
    return parts.join(', ');
  }

  function fieldValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (field === 'paidById') return nameOf(String(value));
    if (field === 'amount' && typeof value === 'number') return money(value);
    return String(value);
  }

  function body(entry: Entry): ReactNode {
    const m = entry.metadata as Meta;
    if (entry.type === 'EXPENSE_CREATED') return t('historyCreated');
    if (entry.type === 'EXPENSE_UPDATED') {
      const changes = (m.changes && !Array.isArray(m.changes) ? m.changes : {}) as Record<string, [unknown, unknown]>;
      const fields = Object.entries(changes);
      if (fields.length === 0) return t('historySaved');
      return (
        <>
          {t('historySaved')}:{' '}
          {fields
            .map(
              ([field, [from, to]]) =>
                `${t(`historyField.${field}`)} ${fieldValue(field, from)} → ${fieldValue(field, to)}`,
            )
            .join(', ')}
        </>
      );
    }
    switch (m.action) {
      case 'update':
        return (
          <>
            {t('historyUpdated')} {itemLink(m.itemId, m.itemName)}
            {m.before && m.after ? `: ${lineDiff(m.before, m.after)}` : ''}
          </>
        );
      case 'add':
        return (
          <>
            {t('historyAdded')} {itemLink(m.itemId, m.itemName)}
            {m.after ? ` (${m.after.quantity}× · ${money(m.after.totalPrice)})` : ''}
          </>
        );
      case 'delete':
        return (
          <>
            {t('historyDeleted')} <span className="font-medium line-through">{m.itemName ?? '?'}</span>
            {m.before ? ` (${money(m.before.totalPrice)})` : ''}
          </>
        );
      case 'split':
        return (
          <>
            {t('historySplit', { quantity: m.quantity ?? 1, of: m.of ?? 1 })} {itemLink(m.itemId, m.itemName)}
          </>
        );
      case 'assign': {
        const changes = Array.isArray(m.changes) ? m.changes : [];
        return (
          <>
            {t('historyAssigned')}
            <ul className="mt-0.5 space-y-0.5">
              {changes.map((c) => (
                <li key={c.itemId}>
                  {itemLink(c.itemId, c.itemName)}: {units(c.before)} → {units(c.after)}
                </li>
              ))}
            </ul>
          </>
        );
      }
      default:
        return null;
    }
  }

  return (
    <Card data-testid="receipt-history">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          {t('historyTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm">
          {entries.map((entry) => (
            <li key={entry.id} className="border-l-2 pl-3">
              <div className="text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
              </div>
              <div>
                <span className="font-medium">{entry.userName ?? '?'}</span> {body(entry)}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
