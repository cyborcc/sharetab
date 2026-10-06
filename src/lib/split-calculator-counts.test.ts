import { describe, test, expect } from 'vitest';
import { calculateSplitTotals } from './split-calculator';

// A line can be shared by unit counts: of three coffees, one person had two and another one.
describe('calculateSplitTotals with per-item unit counts', () => {
  test('splits a line by the units each person had', () => {
    const results = calculateSplitTotals({
      items: [{ totalPrice: 900 }],
      assignments: [{ itemIndex: 0, personIndices: [0, 1], weights: [2, 1] }],
      tax: 0,
      tip: 0,
      peopleCount: 2,
    });
    const byPerson = Object.fromEntries(results.map((r) => [r.personIndex, r.itemTotal]));
    expect(byPerson).toEqual({ 0: 600, 1: 300 });
  });

  test('counts only apply to their own line', () => {
    const results = calculateSplitTotals({
      items: [{ totalPrice: 900 }, { totalPrice: 1000 }],
      assignments: [
        { itemIndex: 0, personIndices: [0, 1], weights: [2, 1] },
        { itemIndex: 1, personIndices: [0, 1] },
      ],
      tax: 0,
      tip: 0,
      peopleCount: 2,
    });
    const byPerson = Object.fromEntries(results.map((r) => [r.personIndex, r.itemTotal]));
    expect(byPerson).toEqual({ 0: 1100, 1: 800 });
  });

  test('rounding rest goes to the last person and nothing is lost', () => {
    const results = calculateSplitTotals({
      items: [{ totalPrice: 1000 }],
      assignments: [{ itemIndex: 0, personIndices: [0, 1, 2], weights: [1, 1, 1] }],
      tax: 100,
      tip: 0,
      peopleCount: 3,
    });
    expect(results.reduce((s, r) => s + r.total, 0)).toBe(1100);
  });

  test('tax is shared in proportion to the units', () => {
    const results = calculateSplitTotals({
      items: [{ totalPrice: 900 }],
      assignments: [{ itemIndex: 0, personIndices: [0, 1], weights: [2, 1] }],
      tax: 90,
      tip: 0,
      peopleCount: 2,
    });
    const byPerson = Object.fromEntries(results.map((r) => [r.personIndex, r.total]));
    expect(byPerson).toEqual({ 0: 660, 1: 330 });
  });
});
