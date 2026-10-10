'use client';

import { useTranslations } from 'next-intl';

/** Small always-visible tip jar: a 🍻 that opens the support dialog. */
export function BeerButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('common');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('sponsor.beer')}
      title={t('sponsor.beer')}
      data-testid="beer-button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors hover:bg-accent"
    >
      <span aria-hidden="true">🍻</span>
    </button>
  );
}
