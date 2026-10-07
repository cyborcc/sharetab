'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatCents } from '@/lib/money';

type Member = { id: string; name: string | null };
type ShareEntry = { userId: string; amount: number };

export function EqualSplit({
  members,
  totalCents,
  onChange,
  locale,
  currency,
  initialSelected,
}: {
  members: Member[];
  totalCents: number;
  onChange: (shares: ShareEntry[]) => void;
  locale?: string;
  currency?: string;
  /** User IDs to pre-select (e.g. when editing an existing expense). Defaults to all members. */
  initialSelected?: string[];
}) {
  const t = useTranslations('expenses.new');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected ?? members.map((m) => m.id)));

  useEffect(() => {
    if (selected.size === 0 || totalCents <= 0) {
      onChange([]);
      return;
    }

    const perPerson = Math.floor(totalCents / selected.size);
    const remainder = totalCents - perPerson * selected.size;
    const selectedArr = Array.from(selected);

    const shares: ShareEntry[] = selectedArr.map((userId, i) => ({
      userId,
      amount: perPerson + (i < remainder ? 1 : 0),
    }));

    onChange(shares);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, totalCents]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // "Select only": one tap leaves just this person ticked, like "show only" in a layer list
  function only(id: string) {
    setSelected(new Set([id]));
  }

  function all() {
    setSelected(new Set(members.map((m) => m.id)));
  }

  const perPerson = selected.size > 0 ? totalCents / selected.size : 0;

  return (
    <div className="space-y-2">
      {selected.size < members.length && members.length > 1 && (
        <button type="button" className="text-xs text-primary hover:underline" onClick={all} data-testid="split-all">
          {t('splitAll')}
        </button>
      )}
      {members.map((m) => (
        <label
          key={m.id}
          className="flex cursor-pointer items-center justify-between rounded-md border p-3 hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.has(m.id)}
              onChange={() => toggle(m.id)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">{m.name ?? 'Unnamed'}</span>
          </div>
          <div className="flex items-center gap-3">
            {selected.has(m.id) && totalCents > 0 && (
              <span className="text-sm text-muted-foreground">
                {formatCents(Math.round(perPerson), currency, locale)}
              </span>
            )}
            {members.length > 1 && !(selected.size === 1 && selected.has(m.id)) && (
              <button
                type="button"
                className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  only(m.id);
                }}
                data-testid={`split-only-${m.id}`}
              >
                {t('splitOnly', { name: (m.name ?? 'Unnamed').split(' ')[0] ?? '' })}
              </button>
            )}
          </div>
        </label>
      ))}
      {selected.size > 0 && totalCents > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatCents(Math.round(perPerson), currency, locale)} per person ({selected.size} selected)
        </p>
      )}
    </div>
  );
}
