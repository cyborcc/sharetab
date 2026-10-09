'use client';

import { useTranslations } from 'next-intl';

/** Small always-visible tip jar: a 🍻 that opens the Ko-fi page. */
export function BeerButton() {
  const t = useTranslations('common');
  return (
    <a
      href="https://ko-fi.com/aks"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('sponsor.beer')}
      title={t('sponsor.beer')}
      data-testid="beer-button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors hover:bg-accent"
    >
      <span aria-hidden="true">🍻</span>
    </a>
  );
}
