import { expect, test, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/server/lib/receipt-processor', () => ({ processReceiptImage: vi.fn() }));
vi.mock('@/server/ai/registry', () => ({
  getAIProvidersWithFallback: vi.fn(),
  getConfiguredProviderPriority: vi.fn(),
  getSelectableModels: vi.fn(() => []),
}));
const getReceiptRate = vi.hoisted(() => vi.fn());
vi.mock('../../lib/receipt-conversion', () => ({ getReceiptRate, relabelReceiptCurrency: vi.fn() }));
import { receiptsRouter } from './receipts';
import { computeBalances } from '../../lib/balance-calculator';
import type { TRPCContext } from '../init';

// Paid by card in EGP: the bank charged its own euro amount. That amount is shared, the receipt
// only gives the proportions.
function fixture(receiptCurrency = 'EGP') {
  const receipt = {
    id: 'receipt',
    uploadedById: 'user',
    status: 'COMPLETED',
    groupId: 'group',
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    group: { members: [{ userId: 'user' }, { userId: 'friend' }] },
    extractedData: {
      currency: receiptCurrency,
      date: '2026-10-06',
      total: 300000,
      subtotal: 300000,
      tax: 0,
      tip: 0,
      alternateTotals: [],
    },
    items: [
      { id: 'fish', name: 'Fisch', quantity: 1, totalPrice: 200000, assignments: [] },
      { id: 'cola', name: 'Cola', quantity: 1, totalPrice: 100000, assignments: [] },
    ],
  };
  const db = {
    user: { findUnique: vi.fn(async () => ({ suspendedAt: null })) },
    group: {
      findUnique: vi.fn(async () => ({ currency: 'EUR', archivedAt: null })),
      findUniqueOrThrow: vi.fn(async () => ({ currency: 'EUR' })),
    },
    groupMember: {
      findUnique: vi.fn(async () => ({ role: 'MEMBER' })),
      findMany: vi.fn(async () => [{ userId: 'user' }, { userId: 'friend' }]),
    },
    receipt: {
      findUnique: vi.fn(async () => receipt),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    expense: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }) => ({ id: 'new', ...data })),
    },
    receiptItemAssignment: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    activityLog: { create: vi.fn(async () => ({})) },
    systemSetting: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (fn) => fn(db));
  const caller = receiptsRouter.createCaller({
    db,
    session: { user: { id: 'user' } },
    headers: new Headers(),
    impersonating: null,
  } as unknown as TRPCContext);
  const input = {
    groupId: 'group',
    receiptId: 'receipt',
    title: 'Abendessen',
    paidById: 'user',
    chargedAmount: 5730, // 57,30 EUR on the card statement
    assignments: [
      { receiptItemId: 'fish', userIds: ['friend'] },
      { receiptItemId: 'cola', userIds: ['user'] },
    ],
  };
  return { caller, db, input };
}

type Created = {
  data: {
    amount: number;
    baseCurrencyAmount: number;
    exchangeRate: number;
    shares: { create: { userId: string; amount: number }[] };
  };
};

test('the charged amount becomes the expense value in group currency, no rate lookup needed', async () => {
  const { caller, db, input } = fixture();
  await caller.assignItemsAndCreateExpense(input);
  expect(getReceiptRate).not.toHaveBeenCalled();
  const { data } = (db.expense.create.mock.calls[0] as unknown as [Created])[0];
  expect(data.amount).toBe(300000);
  expect(data.baseCurrencyAmount).toBe(5730);
  expect(data.exchangeRate).toBeCloseTo(5730 / 300000);
  expect(db.receipt.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        extractedData: expect.objectContaining({ cardCharge: { amount: 5730, currency: 'EUR', rate: 5730 / 300000 } }),
      },
    }),
  );
});

test('balances share exactly the charged amount in the proportions of the receipt', async () => {
  const { caller, db, input } = fixture();
  await caller.assignItemsAndCreateExpense(input);
  const { data } = (db.expense.create.mock.calls[0] as unknown as [Created])[0];
  const balances = computeBalances(
    [
      {
        paidById: 'user',
        amount: data.amount,
        baseCurrencyAmount: data.baseCurrencyAmount,
        shares: data.shares.create,
      },
    ],
    [],
  );
  const owes = Object.fromEntries(balances.map((b) => [b.userId, b.owes]));
  expect(owes).toEqual({ friend: 3820, user: 1910 }); // 2/3 and 1/3 of 57,30
  expect(owes.friend! + owes.user!).toBe(5730);
});

test('a charged amount on a receipt in group currency is refused', async () => {
  const { caller, input } = fixture('EUR');
  await expect(caller.assignItemsAndCreateExpense(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
