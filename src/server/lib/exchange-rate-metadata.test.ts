import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { clearRateCache, getExchangeRateQuote, type RateDatabase } from './exchange-rates';

const now = Date.parse('2026-10-05T12:00:00Z');
function database() {
  const values = new Map<string, string>();
  const db = {
    systemSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        values.has(where.key) ? { value: values.get(where.key) } : null,
      ),
      upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        values.set(where.key, create.value);
      }),
    },
  };
  return { db: db as unknown as RateDatabase, values };
}
function response(data: unknown) {
  return { ok: true, json: async () => data };
}
function latest(rate = 0.016985) {
  return {
    result: 'success',
    base_code: 'EGP',
    time_last_update_unix: (now - 12 * 3600000) / 1000,
    time_next_update_unix: (now + 12 * 3600000) / 1000,
    rates: { EGP: 1, EUR: rate },
  };
}

describe('rate provenance and persistence', () => {
  beforeEach(() => {
    clearRateCache();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  test('persists EGP/EUR metadata and recovers a fresh rate after restart without network', async () => {
    const { db, values } = database();
    const fetch = vi.fn().mockResolvedValue(response(latest()));
    vi.stubGlobal('fetch', fetch);
    const first = await getExchangeRateQuote('EGP', 'EUR', undefined, db);
    expect(first).toMatchObject({
      rate: 0.016985,
      source: 'ExchangeRate-API',
      rateDate: '2026-10-05',
      requestedDate: null,
    });
    expect(values.size).toBe(1);
    clearRateCache();
    fetch.mockRejectedValue(new Error('offline'));
    expect(await getExchangeRateQuote('EGP', 'EUR', undefined, db)).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('does not reuse latest for historical date or silently fall back to latest', async () => {
    const { db } = database();
    const fetch = vi.fn().mockResolvedValueOnce(response(latest())).mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetch);
    await getExchangeRateQuote('EGP', 'EUR', undefined, db);
    expect(await getExchangeRateQuote('EGP', 'EUR', '2026-10-01', db)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![0]).toContain('date=2026-10-01');
  });
  test('rejects historical responses dated differently even on weekends', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response([{ base: 'EGP', quote: 'EUR', date: '2026-10-02', rate: 0.017 }])),
    );
    expect(await getExchangeRateQuote('EGP', 'EUR', '2026-10-03')).toBeNull();
  });
  test('expired persisted latest is not returned during network failure', async () => {
    const { db } = database();
    const fetch = vi.fn().mockResolvedValue(response(latest()));
    vi.stubGlobal('fetch', fetch);
    await getExchangeRateQuote('EGP', 'EUR', undefined, db);
    clearRateCache();
    vi.setSystemTime(now + 2 * 3600000);
    fetch.mockRejectedValue(new Error('offline'));
    expect(await getExchangeRateQuote('EGP', 'EUR', undefined, db)).toBeNull();
  });
  test.each([0, -1, Infinity, NaN, '0.017', undefined])('rejects malformed rate %s', async (rate) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...latest(), rates: { EGP: 1, EUR: rate } })));
    expect(await getExchangeRateQuote('EGP', 'EUR')).toBeNull();
  });
  test.each([
    { ...latest(), base_code: 'USD' },
    { ...latest(), result: 'error' },
    { ...latest(), time_last_update_unix: 1 },
    { ...latest(), time_next_update_unix: 1 },
    [],
  ])('rejects mismatched or stale payload', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(data)));
    expect(await getExchangeRateQuote('EGP', 'EUR')).toBeNull();
  });
  test('rejects invalid currency and impossible/future dates before fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const date of ['2026-02-30', '2026-10-06', 'nonsense'])
      expect(await getExchangeRateQuote('EGP', 'EUR', date)).toBeNull();
    expect(await getExchangeRateQuote('XYZ', 'XYZ')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  test('historical dates stay distinct in memory and persistent storage across restart', async () => {
    const { db } = database();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([{ base: 'EGP', quote: 'EUR', date: '2026-10-01', rate: 0.017 }]))
      .mockResolvedValueOnce(response([{ base: 'EGP', quote: 'EUR', date: '2026-10-02', rate: 0.018 }]));
    vi.stubGlobal('fetch', fetch);
    expect((await getExchangeRateQuote('EGP', 'EUR', '2026-10-01', db))?.rate).toBe(0.017);
    expect((await getExchangeRateQuote('EGP', 'EUR', '2026-10-02', db))?.rate).toBe(0.018);
    clearRateCache();
    fetch.mockRejectedValue(new Error('offline'));
    expect((await getExchangeRateQuote('EGP', 'EUR', '2026-10-01', db))?.rate).toBe(0.017);
    expect((await getExchangeRateQuote('EGP', 'EUR', '2026-10-02', db))?.rate).toBe(0.018);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  test('malformed JSON never becomes a conversion rate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('bad JSON');
        },
      }),
    );
    expect(await getExchangeRateQuote('EGP', 'EUR')).toBeNull();
  });
  test('corrupt persistence cannot provide a rate', async () => {
    const { db, values } = database();
    values.set('exchangeRate:v1:EGP:EUR:latest', '{');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getExchangeRateQuote('EGP', 'EUR', undefined, db)).toBeNull();
  });
});
