import { describe, it, expect } from 'vitest';
import { receiptExtractionSchema } from './schema';

// The extraction prompt tells the model to answer "null" for anything it cannot
// read (store name, date, address) and models also send null for tax and tip on
// receipts without those lines. Those answers used to fail validation, so the
// scan reported "Receipt extraction failed" although the items were read fine.
const base = {
  items: [{ name: 'Pizza Margherita', quantity: 1, unitPrice: 950, totalPrice: 950 }],
  subtotal: 950,
  total: 950,
  currency: 'EUR',
};

describe('receiptExtractionSchema with null answers from the model', () => {
  it('accepts null for merchantName, merchantAddress and date', () => {
    const r = receiptExtractionSchema.parse({ ...base, merchantName: null, merchantAddress: null, date: null });
    expect(r.merchantName).toBeUndefined();
    expect(r.merchantAddress).toBeUndefined();
    expect(r.date).toBeUndefined();
  });

  it('turns null tax and tip into 0', () => {
    const r = receiptExtractionSchema.parse({ ...base, tax: null, tip: null });
    expect(r.tax).toBe(0);
    expect(r.tip).toBe(0);
  });

  it('turns a null alternateTotals and a null currency into the defaults', () => {
    const r = receiptExtractionSchema.parse({ ...base, currency: null, alternateTotals: null });
    expect(r.currency).toBe('USD');
    expect(r.alternateTotals).toEqual([]);
  });

  it('keeps real values untouched', () => {
    const r = receiptExtractionSchema.parse({ ...base, merchantName: 'Sonnenhof', date: '2026-10-05', tax: 62, tip: 100 });
    expect(r).toMatchObject({ merchantName: 'Sonnenhof', date: '2026-10-05', tax: 62, tip: 100 });
  });

  it('still rejects a receipt without items or with a negative total', () => {
    expect(() => receiptExtractionSchema.parse({ ...base, items: [] })).toThrow();
    expect(() => receiptExtractionSchema.parse({ ...base, total: -5 })).toThrow();
  });
});
