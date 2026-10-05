import type { RateQuote } from '@/server/lib/exchange-rates';
import { formatCents } from '@/lib/money';

export function euroPreviewCents(amount: number, quote: Pick<RateQuote, 'rate'> | null | undefined): number | null {
  if (!quote || !Number.isSafeInteger(amount) || !Number.isFinite(quote.rate) || quote.rate <= 0) return null;
  const converted = Math.round(amount * quote.rate);
  return Number.isSafeInteger(converted) ? converted : null;
}

/** Amount is the current edited item/tax/tip total, not an unchanged OCR total. */
export function ReceiptRatePreview({
  amount,
  quote,
  locale,
  loading,
}: {
  amount: number;
  quote: RateQuote | null | undefined;
  locale: string;
  loading: boolean;
}) {
  const de = locale.startsWith('de');
  const euros = euroPreviewCents(amount, quote);
  return (
    <div className="space-y-1 border-t pt-2" aria-live="polite" data-testid="euro-preview">
      <div className="flex justify-between font-semibold">
        <span>{de ? 'Euro-Vorschau' : 'Euro preview'}</span>
        <span>
          {loading
            ? de
              ? 'Kurs wird geladen…'
              : 'Loading rate…'
            : euros === null
              ? de
                ? 'Nicht verfügbar'
                : 'Unavailable'
              : formatCents(euros, 'EUR', locale)}
        </span>
      </div>
      {!loading && !quote && (
        <p className="text-amber-700 dark:text-amber-400">
          {de
            ? 'Kein gültiger Kurs für das Belegdatum. Es wird kein Ersatzkurs verwendet.'
            : 'No valid rate for the receipt date. No substitute rate is used.'}
        </p>
      )}
      {!loading && quote && (
        <p className="text-xs text-muted-foreground">
          1 {quote.from} = {quote.rate} {quote.to} ·{' '}
          {quote.source === 'receipt' ? (de ? 'Auf dem Beleg gedruckter Kurs' : 'Receipt-printed rate') : quote.source}
          {quote.rateDate && (
            <>
              {' '}
              · {de ? 'Kursdatum' : 'Rate date'}: {quote.rateDate}
            </>
          )}
          {quote.source !== 'receipt' && quote.source !== 'identity' && (
            <>
              {' '}
              · {de ? 'Abgerufen' : 'Retrieved'}:{' '}
              {new Date(quote.fetchedAt).toLocaleString(locale, { timeZone: 'UTC' })} UTC
            </>
          )}
          {quote.source === 'ExchangeRate-API' && (
            <>
              {' '}
              ·{' '}
              <a
                href="https://www.exchangerate-api.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Rates By Exchange Rate API
              </a>
            </>
          )}
        </p>
      )}
      {!loading && quote && quote.requestedDate === null && quote.source !== 'identity' && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {de
            ? 'Aktueller Referenzkurs (Schätzung), kein historischer Belegkurs und kein tatsächlicher Karten-/Bankkurs.'
            : 'Latest reference rate (estimate), not a historical receipt rate or the actual card/bank rate.'}
        </p>
      )}
    </div>
  );
}
