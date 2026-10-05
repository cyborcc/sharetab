import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/server/lib/receipt-processor', () => ({ processReceiptImage: vi.fn() }));
vi.mock('@/server/ai/registry', () => ({
  getAIProvidersWithFallback: vi.fn(),
  getConfiguredProviderPriority: vi.fn(),
}));
import { receiptsRouter } from './receipts';
import type { TRPCContext } from '../init';
import { clearRateCache } from '@/server/lib/exchange-rates';

function fixture() {
  const receipt = {
    id: 'receipt',
    uploadedById: 'user',
    status: 'COMPLETED',
    groupId: 'group',
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    group: { members: [{ userId: 'user' }] },
    extractedData: {
      currency: 'EGP',
      date: '2026-10-01',
      total: 248338,
      subtotal: 248338,
      tax: 0,
      tip: 0,
      alternateTotals: [{ currency: 'EUR', total: 4282 }],
    },
    items: [{ id: 'item', totalPrice: 248338 }],
  };
  const db = {
    user: { findUnique: vi.fn(async () => ({ suspendedAt: null })) },
    group: {
      findUnique: vi.fn(async () => ({ currency: 'EUR', archivedAt: null })),
      findUniqueOrThrow: vi.fn(async () => ({ currency: 'EUR' })),
    },
    groupMember: { findUnique: vi.fn(async () => ({})), findMany: vi.fn(async () => [{ userId: 'user' }]) },
    receipt: {
      findUnique: vi.fn(async () => receipt),
      findUniqueOrThrow: vi.fn(async () => receipt),
      updateMany: vi.fn<(args: { data: { extractedData: Record<string, unknown> } }) => Promise<{ count: number }>>(
        async () => ({ count: 1 }),
      ),
    },
    expense: { findUnique: vi.fn(async () => null), create: vi.fn(async ({ data }) => ({ id: 'expense', ...data })) },
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
    title: 'Dinner',
    paidById: 'user',
    assignments: [{ receiptItemId: 'item', userIds: ['user'] }],
  };
  return { caller, db, receipt, input };
}
beforeEach(() => clearRateCache());

test('backend preview-to-save keeps EGP amounts, uses the displayed printed EUR ratio, and persists provenance', async () => {
  const { caller, input, db } = fixture();
  const preview = await caller.getConversionPreview({ groupId: 'group', receiptId: 'receipt' });
  expect(preview.euro).toMatchObject({ source: 'receipt', rateDate: '2026-10-01' });
  const result = await caller.assignItemsAndCreateExpense({ ...input, expectedConversion: preview.groupRate! });
  expect(result).toMatchObject({ amount: 248338, currency: 'EGP', baseCurrencyAmount: 4282 });
  expect(db.receipt.updateMany.mock.calls[0]![0].data.extractedData.expenseConversion).toMatchObject({
    source: 'receipt',
  });
  expect(db.receipt.updateMany.mock.calls[0]![0].data.extractedData.latestRateAccepted).toBe(false);
});

test('unpreviewed or changed exchange ratio is rejected before expense writes', async () => {
  const { caller, input, db } = fixture();
  await expect(caller.assignItemsAndCreateExpense(input)).rejects.toMatchObject({ code: 'CONFLICT' });
  const preview = await caller.getConversionPreview({ groupId: 'group', receiptId: 'receipt' });
  await expect(
    caller.assignItemsAndCreateExpense({ ...input, expectedConversion: { ...preview.groupRate!, rate: 1 } }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(db.expense.create).not.toHaveBeenCalled();
});

test('correction only relabels JSON, clears incompatible alternate totals, and never updates item amounts', async () => {
  const { caller, db } = fixture();
  await caller.correctCurrency({ receiptId: 'receipt', currency: 'USD' });
  expect(db.receipt.updateMany.mock.calls[0]![0].data.extractedData).toMatchObject({
    currency: 'USD',
    total: 248338,
    alternateTotals: [],
    originalCurrencyExtraction: { currency: 'EGP' },
  });
  expect(db.expense.create).not.toHaveBeenCalled();
});

test('linked receipt and concurrently changed receipt cannot be corrected', async () => {
  const f = fixture();
  f.db.expense.findUnique.mockResolvedValue({ id: 'expense' } as never);
  await expect(f.caller.correctCurrency({ receiptId: 'receipt', currency: 'USD' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  expect(f.db.receipt.updateMany).not.toHaveBeenCalled();
  f.db.expense.findUnique.mockResolvedValue(null);
  f.db.receipt.updateMany.mockResolvedValue({ count: 0 });
  await expect(f.caller.correctCurrency({ receiptId: 'receipt', currency: 'USD' })).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

test('outsiders cannot query rates or correct currency; invalid currency cannot be relabelled', async () => {
  const { caller, receipt, db } = fixture();
  receipt.group.members = [];
  await expect(caller.getConversionPreview({ groupId: 'group', receiptId: 'receipt' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(caller.correctCurrency({ receiptId: 'receipt', currency: 'USD' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(caller.correctCurrency({ receiptId: 'receipt', currency: 'XYZ' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  expect(db.receipt.updateMany).not.toHaveBeenCalled();
});
