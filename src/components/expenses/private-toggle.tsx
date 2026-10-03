'use client';

import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';

/** Checkbox "private expense": only offered while the payer is the only one sharing the expense. */
export function PrivateToggle({
  checked,
  eligible,
  onChange,
}: {
  checked: boolean;
  eligible: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTranslations('expenses');
  if (!eligible) return null;
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="flex items-center gap-1.5 font-medium">
          <Lock className="h-3.5 w-3.5" />
          {t('new.privateLabel')}
        </span>
        <span className="text-xs text-muted-foreground">{t('new.privateHint')}</span>
      </span>
    </label>
  );
}
