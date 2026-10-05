/** Validated rates with provenance, date-specific durable caching and no stale fallback. */
import { TRPCError } from '@trpc/server';
import { MAX_MONEY_CENTS } from '@/lib/money';
import type { PrismaClient } from '@/generated/prisma/client';

export type RateDatabase = Pick<PrismaClient, 'systemSetting'>;
export type RateQuote = {
  from: string;
  to: string;
  rate: number;
  source: 'Frankfurter' | 'ExchangeRate-API' | 'identity' | 'receipt';
  requestedDate: string | null;
  rateDate: string;
  fetchedAt: number;
  expiresAt: number;
};
export type PrintedReceiptTotal = { currency: string; total: number };
const rateCache = new Map<string, RateQuote>();
const currencies = new Set(Intl.supportedValuesOf('currency'));
export function isValidCurrency(code: string): boolean {
  return /^[A-Za-z]{3}$/.test(code) && currencies.has(code.toUpperCase());
}
export function isValidRateDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date <= new Date().toISOString().slice(0, 10)
  );
}
function positiveRate(rate: unknown): rate is number {
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0;
}
function usable(value: unknown, from: string, to: string, date?: string): value is RateQuote {
  if (!value || typeof value !== 'object') return false;
  const q = value as RateQuote;
  const now = Date.now();
  return (
    q.from === from &&
    q.to === to &&
    q.requestedDate === (date ?? null) &&
    ['Frankfurter', 'ExchangeRate-API'].includes(q.source) &&
    positiveRate(q.rate) &&
    isValidRateDate(q.rateDate) &&
    (!date || (q.rateDate === date && q.source === 'Frankfurter')) &&
    Number.isFinite(q.fetchedAt) &&
    q.fetchedAt <= now &&
    Number.isFinite(q.expiresAt) &&
    q.expiresAt > now &&
    (date
      ? q.expiresAt <= q.fetchedAt + 30 * 86400000
      : q.expiresAt <= q.fetchedAt + 3600000 && now - Date.parse(q.rateDate) < 3 * 86400000)
  );
}
async function fetchQuote(from: string, to: string, date?: string, allowOpen = true): Promise<RateQuote | null> {
  // This open endpoint has latest rates ONLY. Never call it for a historical lookup.
  const sources: RateQuote['source'][] =
    date || !allowOpen
      ? ['Frankfurter']
      : from === 'EGP'
        ? ['ExchangeRate-API', 'Frankfurter']
        : ['Frankfurter', 'ExchangeRate-API'];
  for (const source of sources) {
    try {
      const params = new URLSearchParams({ base: from, quotes: to });
      if (date) params.set('date', date);
      const url =
        source === 'Frankfurter'
          ? `https://api.frankfurter.dev/v2/rates?${params}`
          : `https://open.er-api.com/v6/latest/${from}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      const fetchedAt = Date.now();
      let rate: unknown;
      let rateDate: string;
      let expiresAt = fetchedAt + (date ? 30 * 86400000 : 3600000);
      if (source === 'Frankfurter') {
        if (!Array.isArray(data) || data.length !== 1) continue;
        const row = data[0];
        if (
          !row ||
          typeof row.base !== 'string' ||
          typeof row.quote !== 'string' ||
          row.base.toUpperCase() !== from ||
          row.quote.toUpperCase() !== to ||
          typeof row.date !== 'string'
        )
          continue;
        rate = row.rate;
        rateDate = row.date;
      } else {
        if (
          !data ||
          data.result !== 'success' ||
          data.base_code !== from ||
          data.rates?.[from] !== 1 ||
          !Number.isFinite(data.time_last_update_unix) ||
          !Number.isFinite(data.time_next_update_unix)
        )
          continue;
        const updatedAt = data.time_last_update_unix * 1000;
        const nextUpdate = data.time_next_update_unix * 1000;
        if (
          updatedAt > fetchedAt ||
          fetchedAt - updatedAt > 48 * 3600000 ||
          nextUpdate <= fetchedAt ||
          nextUpdate <= updatedAt
        )
          continue;
        rate = data.rates?.[to];
        rateDate = new Date(updatedAt).toISOString().slice(0, 10);
        expiresAt = Math.min(expiresAt, nextUpdate);
      }
      if (!positiveRate(rate)) continue;
      const quote: RateQuote = { from, to, rate, source, requestedDate: date ?? null, rateDate, fetchedAt, expiresAt };
      if (usable(quote, from, to, date)) return quote;
    } catch {
      // Network/JSON errors do not authorize a date or freshness substitution.
    }
  }
  return null;
}

export async function getExchangeRateQuote(
  from: string,
  to: string,
  date?: string,
  db?: RateDatabase,
  allowOpen = true,
): Promise<RateQuote | null> {
  if (!isValidCurrency(from) || !isValidCurrency(to) || (date !== undefined && !isValidRateDate(date))) return null;
  from = from.toUpperCase();
  to = to.toUpperCase();
  if (from === to)
    return {
      from,
      to,
      rate: 1,
      source: 'identity',
      requestedDate: date ?? null,
      rateDate: date ?? new Date().toISOString().slice(0, 10),
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };
  const key = `exchangeRate:v1:${from}:${to}:${date ?? 'latest'}`;
  const cached = rateCache.get(key);
  if (usable(cached, from, to, date) && (allowOpen || cached.source !== 'ExchangeRate-API')) return cached;
  if (db) {
    try {
      const stored = await db.systemSetting.findUnique({ where: { key }, select: { value: true } });
      const quote: unknown = stored ? JSON.parse(stored.value) : null;
      if (usable(quote, from, to, date) && (allowOpen || quote.source !== 'ExchangeRate-API')) {
        rateCache.set(key, quote);
        return quote;
      }
    } catch {
      // A corrupt/unavailable cache is not a valid rate. Attempt a real lookup.
    }
  }
  const quote = await fetchQuote(from, to, date, allowOpen);
  if (!quote) return null;
  if (db) {
    try {
      const value = JSON.stringify(quote);
      await db.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    } catch {
      console.warn('[exchange-rates] Could not persist validated rate metadata');
    }
  }
  rateCache.set(key, quote);
  return quote;
}

/** Legacy numeric consumers have no attribution/provenance UI: keep their
 * Frankfurter-only contract. Receipt flows use the metadata API above. */
export async function getExchangeRate(
  from: string,
  to: string,
  date?: string,
  db?: RateDatabase,
): Promise<number | null> {
  return (await getExchangeRateQuote(from, to, date, db, false))?.rate ?? null;
}

/** Derive a rate from an explicitly printed total; never rewrite original amounts. */
export function getPrintedReceiptRate(
  sourceTotalCents: number,
  alternateTotals: PrintedReceiptTotal[],
  targetCurrency: string,
): number | null {
  if (!Number.isSafeInteger(sourceTotalCents) || sourceTotalCents <= 0 || !isValidCurrency(targetCurrency)) return null;
  const total = alternateTotals.find((t) => t.currency.toUpperCase() === targetCurrency.toUpperCase())?.total;
  return typeof total === 'number' && Number.isSafeInteger(total) && total > 0 ? total / sourceTotalCents : null;
}

export function convertCents(amountCents: number, exchangeRate: number): number {
  if (!Number.isSafeInteger(amountCents) || !positiveRate(exchangeRate)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid amount or exchange rate.' });
  }
  const converted = Math.round(amountCents * exchangeRate);
  if (!Number.isFinite(converted) || Math.abs(converted) > MAX_MONEY_CENTS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Converted amount is too large. Check the exchange rate.' });
  }
  return converted;
}

/** Clear only process-local cache; persisted metadata survives restart. */
export function clearRateCache(): void {
  rateCache.clear();
}
