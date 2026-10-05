import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { getExchangeRate, getPrintedReceiptRate, convertCents, clearRateCache } from './exchange-rates';

describe('convertCents', () => {
  test('converts cents with exchange rate', () => {
    // 1000 cents USD * 0.92 EUR/USD = 920 cents EUR
    expect(convertCents(1000, 0.92)).toBe(920);
  });

  test('rounds to nearest cent', () => {
    // 1000 cents * 1.234 = 1234.0 (no rounding needed)
    expect(convertCents(1000, 1.234)).toBe(1234);
    // 999 cents * 1.234 = 1232.766 → 1233
    expect(convertCents(999, 1.234)).toBe(1233);
  });

  test('handles rate of 1.0 (same currency)', () => {
    expect(convertCents(5000, 1.0)).toBe(5000);
  });

  test('handles very small amounts', () => {
    expect(convertCents(1, 0.5)).toBe(1); // Math.round(0.5) = 1 in JS
  });

  test('handles zero', () => {
    expect(convertCents(0, 1.5)).toBe(0);
  });

  test('rejects amounts that overflow the Int4 money column', () => {
    // 10,000,000 cents * 1,000,000 rate = 10^13, beyond int4 max (2147483647)
    expect(() => convertCents(10_000_000, 1_000_000)).toThrow('Converted amount is too large');
  });

  test('accepts amounts at the Int4 boundary', () => {
    expect(convertCents(2_147_483_647, 1.0)).toBe(2_147_483_647);
  });
});

describe('getExchangeRate', () => {
  beforeEach(() => {
    clearRateCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns 1.0 for same currency', async () => {
    const rate = await getExchangeRate('USD', 'USD');
    expect(rate).toBe(1.0);
  });

  test('returns 1.0 for same currency (case insensitive)', async () => {
    const rate = await getExchangeRate('usd', 'USD');
    expect(rate).toBe(1.0);
  });

  test('fetches rate from API successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ base: 'USD', quote: 'EUR', rate: 0.92 }]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const rate = await getExchangeRate('USD', 'EUR');
    expect(rate).toBe(0.92);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]![0]).toContain('base=USD&quotes=EUR');
  });

  test('uses cached rate on second call', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ base: 'USD', quote: 'EUR', rate: 0.92 }]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const rate1 = await getExchangeRate('USD', 'EUR');
    const rate2 = await getExchangeRate('USD', 'EUR');
    expect(rate1).toBe(0.92);
    expect(rate2).toBe(0.92);
    // Should only fetch once due to cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('uses date in URL for historical rates', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ base: 'USD', quote: 'GBP', rate: 0.78 }]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const rate = await getExchangeRate('USD', 'GBP', '2025-01-15');
    expect(rate).toBe(0.78);
    expect(mockFetch.mock.calls[0]![0]).toContain('2025-01-15');
  });

  test('supports EGP with the v2 endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ base: 'EGP', quote: 'EUR', rate: 0.017 }]),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(getExchangeRate('EGP', 'EUR', '2026-10-05')).resolves.toBe(0.017);
    expect(mockFetch.mock.calls[0]![0]).toContain('base=EGP&quotes=EUR&date=2026-10-05');
  });

  test('returns null on API error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', mockFetch);

    const rate = await getExchangeRate('USD', 'EUR');
    expect(rate).toBeNull();
  });

  test('returns null on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const rate = await getExchangeRate('USD', 'EUR');
    expect(rate).toBeNull();
  });

  test('returns null for invalid rate data', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]), // missing rate
    });
    vi.stubGlobal('fetch', mockFetch);

    const rate = await getExchangeRate('USD', 'XYZ');
    expect(rate).toBeNull();
  });
});

describe('getPrintedReceiptRate', () => {
  test('uses the merchant-printed EGP to EUR total', () => {
    expect(getPrintedReceiptRate(248_338, [{ currency: 'EUR', total: 4_282 }], 'EUR')).toBe(4_282 / 248_338);
  });

  test('returns null when the receipt has no matching printed total', () => {
    expect(getPrintedReceiptRate(248_338, [{ currency: 'USD', total: 4_893 }], 'EUR')).toBeNull();
  });
});
