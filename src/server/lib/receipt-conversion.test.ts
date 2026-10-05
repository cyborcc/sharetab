import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReceiptRatePreview, euroPreviewCents } from '@/components/receipts/receipt-rate-preview';
import { getReceiptRate, relabelReceiptCurrency } from './receipt-conversion';
import { clearRateCache, type RateDatabase, type RateQuote } from './exchange-rates';
import { parseExtractedData } from './json-schemas';

const db = {
  systemSetting: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
} as unknown as RateDatabase;
const data = parseExtractedData({
  currency: 'EGP',
  date: '2026-10-01',
  total: 248338,
  subtotal: 220000,
  tax: 28338,
  tip: 0,
  alternateTotals: [{ currency: 'EUR', total: 4282 }],
});
beforeEach(() => {
  clearRateCache();
  vi.stubGlobal('React', React);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('relabels numbers without conversion, invalidates ALL alternate totals, and keeps original extraction', () => {
  const corrected = relabelReceiptCurrency(data, 'usd');
  expect(corrected).toMatchObject({
    currency: 'USD',
    total: 248338,
    subtotal: 220000,
    tax: 28338,
    tip: 0,
    alternateTotals: [],
  });
  expect(corrected.originalCurrencyExtraction).toEqual({ currency: 'EGP', alternateTotals: data.alternateTotals });
  expect(data.currency).toBe('EGP');
  expect(data.alternateTotals).toHaveLength(1);
  expect(relabelReceiptCurrency(corrected, 'EUR').originalCurrencyExtraction).toEqual(
    corrected.originalCurrencyExtraction,
  );
  expect(relabelReceiptCurrency(data, 'egp')).toBe(data);
  expect(() => relabelReceiptCurrency(data, 'XYZ')).toThrow('Invalid currency');
});

test('printed rate takes priority and the Euro preview recomputes when amounts/tip change', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const rate = await getReceiptRate(data, 'EUR', true, db);
  expect(rate?.source).toBe('receipt');
  expect(fetch).not.toHaveBeenCalled();
  expect(euroPreviewCents(data.total, rate)).toBe(4282);
  expect(euroPreviewCents(100000, rate)).toBe(1724);
  expect(euroPreviewCents(data.total + 1000, rate)).toBe(4299);
});

test('historical network failure stays unavailable; only explicit latest consent permits open API', async () => {
  const updated = Math.floor(Date.now() / 1000) - 100;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 403 })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        base_code: 'EGP',
        time_last_update_unix: updated,
        time_next_update_unix: updated + 86400,
        rates: { EGP: 1, EUR: 0.017 },
      }),
    });
  vi.stubGlobal('fetch', fetch);
  const noPrinted = { ...data, alternateTotals: [] };
  expect(await getReceiptRate(noPrinted, 'EUR', false, db)).toBeNull();
  const quote = await getReceiptRate(noPrinted, 'EUR', true, db);
  expect(quote).toMatchObject({ source: 'ExchangeRate-API', requestedDate: null, rate: 0.017 });
  expect(fetch.mock.calls[0]![0]).toContain('date=2026-10-01');
  expect(fetch.mock.calls[1]![0]).toBe('https://open.er-api.com/v6/latest/EGP');
});

test('currency correction recomputes a new ratio instead of reusing incompatible printed EUR', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ base: 'USD', quote: 'EUR', date: '2026-10-01', rate: 0.9 }],
    }),
  );
  const corrected = relabelReceiptCurrency(data, 'USD');
  const rate = await getReceiptRate(corrected, 'EUR', false, db);
  expect(rate?.source).toBe('Frankfurter');
  expect(euroPreviewCents(corrected.total, rate)).toBe(223504);
});

test('Euro receipts retain an explicit 1:1 Euro preview even when their OCR date is invalid', async () => {
  const quote = await getReceiptRate({ ...data, currency: 'EUR', date: 'nonsense' }, 'EUR', false, db);
  expect(quote?.source).toBe('identity');
  expect(euroPreviewCents(data.total, quote)).toBe(data.total);
});

test('actual preview markup always displays Euro status and discloses source/date/latest estimate/attribution', () => {
  const unavailable = renderToStaticMarkup(
    React.createElement(ReceiptRatePreview, { amount: data.total, quote: null, locale: 'de', loading: false }),
  );
  expect(unavailable).toContain('Euro-Vorschau');
  expect(unavailable).toContain('Nicht verfügbar');
  expect(unavailable).toContain('kein Ersatzkurs');
  const quote: RateQuote = {
    from: 'EGP',
    to: 'EUR',
    rate: 0.017,
    source: 'ExchangeRate-API',
    requestedDate: null,
    rateDate: '2026-10-05',
    fetchedAt: Date.parse('2026-10-05T12:00:00Z'),
    expiresAt: Date.parse('2026-10-05T13:00:00Z'),
  };
  const available = renderToStaticMarkup(
    React.createElement(ReceiptRatePreview, { amount: data.total, quote, locale: 'de', loading: false }),
  );
  expect(available).toContain('42,22');
  expect(available).toContain('Schätzung');
  expect(available).toContain('kein historischer');
  expect(available).toContain('2026-10-05');
  expect(available).toContain('ExchangeRate-API');
  expect(available).toContain('https://www.exchangerate-api.com');
  const loading = renderToStaticMarkup(
    React.createElement(ReceiptRatePreview, { amount: data.total, quote, locale: 'de', loading: true }),
  );
  expect(loading).toContain('Kurs wird geladen');
  expect(loading).not.toContain('42,22');
});
