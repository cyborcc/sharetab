'use client';

import { useTranslations } from 'next-intl';
import { categoryIcon } from '@/lib/categories';
import { Input } from '@/components/ui/input';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
const CUSTOM = '__custom__';

/** Dropdown with preset categories plus a free-text option, so nobody has to type "Essen" every time. */
export function CategorySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations('expenses');
  const presets = t.raw('new.categoryPresets') as string[];
  const isPreset = value === '' || presets.includes(value);
  const selectValue = isPreset ? value : CUSTOM;

  return (
    <div className="space-y-2">
      <select
        id="category"
        value={selectValue}
        onChange={(e) => onChange(e.target.value === CUSTOM ? ' ' : e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{t('new.categoryNone')}</option>
        {presets.map((p) => (
          <option key={p} value={p}>
            {categoryIcon(p)} {p}
          </option>
        ))}
        <option value={CUSTOM}>{t('new.categoryCustom')}</option>
      </select>
      {selectValue === CUSTOM && (
        <Input
          autoFocus
          placeholder={t('new.categoryPlaceholder')}
          value={value.trim() === '' ? '' : value}
          maxLength={50}
          onChange={(e) => onChange(e.target.value || ' ')}
        />
      )}
    </div>
  );
}
