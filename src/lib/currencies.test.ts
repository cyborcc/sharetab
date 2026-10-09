import { describe, expect, it } from 'vitest';
import { COMMON_CURRENCIES, orderCurrencies } from './currencies';

describe('orderCurrencies', () => {
  it('puts the group currency first and the latest foreign currency second', () => {
    const codes = orderCurrencies('EUR', ['EGP', 'USD']).map((c) => c.code);
    expect(codes.slice(0, 3)).toEqual(['EUR', 'EGP', 'USD']);
  });

  it('keeps every currency once', () => {
    const codes = orderCurrencies('EGP', ['EGP', 'egp', 'EUR']).map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(COMMON_CURRENCIES.length);
    expect(codes.slice(0, 2)).toEqual(['EGP', 'EUR']);
  });

  it('keeps the default order without a group currency or recent ones', () => {
    expect(orderCurrencies(undefined).map((c) => c.code)).toEqual(COMMON_CURRENCIES.map((c) => c.code));
  });

  it('keeps an unlisted code, without a name', () => {
    const list = orderCurrencies('EUR', ['JOD']);
    expect(list[1]).toEqual({ code: 'JOD', name: 'JOD' });
  });

  it('ignores malformed codes', () => {
    const codes = orderCurrencies('EUR', ['', '??', 'EURO']).map((c) => c.code);
    expect(codes).toHaveLength(COMMON_CURRENCIES.length);
  });
});
