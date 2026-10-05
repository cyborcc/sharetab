import { TRPCError } from '@trpc/server';
import type { ExtractedData } from './json-schemas';
import {
  getExchangeRateQuote,
  getPrintedReceiptRate,
  isValidCurrency,
  type RateDatabase,
  type RateQuote,
} from './exchange-rates';

/** A correction relabels every existing numeric amount, it does NOT convert money.
 * Printed alternate totals no longer prove a ratio after correcting the source label.
 * Keep the original extraction for audit/recovery in the existing JSON column.
 */
export function relabelReceiptCurrency(data: ExtractedData, currency: string): ExtractedData {
  if (!isValidCurrency(currency)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid currency.' });
  currency = currency.toUpperCase();
  if (currency === data.currency.toUpperCase()) return data;
  return {
    ...data,
    currency,
    alternateTotals: [],
    originalCurrencyExtraction: data.originalCurrencyExtraction ?? {
      currency: data.currency,
      alternateTotals: data.alternateTotals,
    },
  };
}

/** Preview and expense creation deliberately share the identical rate selection. */
export async function getReceiptRate(
  data: ExtractedData,
  target: string,
  useLatestRate: boolean,
  db: RateDatabase,
): Promise<RateQuote | null> {
  if (!isValidCurrency(data.currency) || !isValidCurrency(target)) return null;
  const from = data.currency.toUpperCase();
  target = target.toUpperCase();
  const date = data.date?.slice(0, 10);
  if (from === target) return getExchangeRateQuote(from, target, undefined, db);
  const printedRate = getPrintedReceiptRate(data.total, data.alternateTotals, target);
  if (printedRate !== null)
    return {
      from,
      to: target,
      rate: printedRate,
      source: 'receipt',
      requestedDate: date ?? null,
      rateDate: date ?? '',
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };
  // Explicit user consent allows a latest estimate for a dated receipt. Otherwise
  // a historical lookup must succeed on that exact date or remain unavailable.
  return getExchangeRateQuote(from, target, useLatestRate ? undefined : date, db);
}
