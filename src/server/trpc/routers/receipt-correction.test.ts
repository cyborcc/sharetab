import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const { extract } = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock('@/server/lib/receipt-processor', () => ({ extractReceiptImage: extract, processReceiptImage: vi.fn() }));
import { receiptsRouter } from './receipts';
import type { TRPCContext } from '../init';

const extraction = {
  merchantName: 'Corrected café',
  currency: 'EUR',
  date: '2026-10-01',
  items: [{ name: 'Coffee', quantity: 2, unitPrice: 250, totalPrice: 500 }],
  subtotal: 500,
  tax: 50,
  tip: 0,
  total: 550,
  alternateTotals: [{ currency: 'USD', total: 600 }],
};
function fixture() {
  const receipt = {
    id: 'receipt',
    imagePath: '/uploads/test.png',
    mimeType: 'image/png',
    status: 'COMPLETED',
    groupId: 'group',
    paidById: 'user',
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    group: { members: [{ userId: 'user' }], archivedAt: null },
    rawResponse: { original: true },
    extractedData: {
      currency: 'EGP',
      subtotal: 1000,
      tax: 0,
      tip: 0,
      total: 1000,
      alternateTotals: [{ currency: 'EUR', total: 20 }],
      expenseConversion: { rate: 0.02 },
      latestRateAccepted: true,
    },
    items: [
      {
        id: 'item',
        name: 'Old coffee',
        quantity: 1,
        unitPrice: 1000,
        totalPrice: 1000,
        assignments: [{ id: 'a', userId: 'user' }],
      },
    ],
  };
  let stored: { key: string; value: string } | null = null;
  const db = {
    user: { findUnique: vi.fn(async () => ({ suspendedAt: null })) },
    receipt: {
      findUnique: vi.fn(async () => receipt),
      updateMany: vi.fn(async (args: unknown) => {
        void args;
        return { count: 1 };
      }),
    },
    expense: { findUnique: vi.fn(async () => null) },
    receiptItem: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    systemSetting: {
      upsert: vi.fn(async ({ create }) => {
        stored = create;
        return create;
      }),
      findUnique: vi.fn(async () => stored),
      deleteMany: vi.fn(async () => {
        stored = null;
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (fn) => fn(db));
  const caller = receiptsRouter.createCaller({
    db,
    session: { user: { id: 'user' } },
    headers: new Headers(),
    impersonating: null,
  } as unknown as TRPCContext);
  return {
    db,
    receipt,
    caller,
    input: { receiptId: 'receipt', groupId: 'group', correctionHint: 'Fix coffee and currency' },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  extract.mockResolvedValue({ extraction, provider: 'mock' });
});

test('preview persists only a server candidate; money, items, status and raw response remain untouched until confirm', async () => {
  const f = fixture();
  const original = structuredClone(f.receipt);
  const p = await f.caller.previewCorrection(f.input);
  expect(f.receipt).toEqual(original);
  expect(f.db.receipt.updateMany).not.toHaveBeenCalled();
  expect(f.db.receiptItem.deleteMany).not.toHaveBeenCalled();
  expect(p.extraction).toMatchObject({ currency: 'EUR', total: 550, alternateTotals: [] });
  await f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'group', token: p.token });
  const data = f.db.receipt.updateMany.mock.calls[0]![0] as unknown as {
    data: { extractedData: Record<string, unknown> };
  };
  expect(data.data.extractedData).toMatchObject({ currency: 'EUR', total: 550, alternateTotals: [] });
  expect(data.data.extractedData).not.toHaveProperty('expenseConversion');
  expect(data.data.extractedData).not.toHaveProperty('latestRateAccepted');
  expect(f.db.receiptItem.createMany).toHaveBeenCalledWith({
    data: [{ ...extraction.items[0], receiptId: 'receipt', sortOrder: 0 }],
  });
  expect(f.db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  await expect(
    f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'group', token: p.token }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});

test('discard removes candidate without receipt writes, including after finalization', async () => {
  const f = fixture();
  const p = await f.caller.previewCorrection(f.input);
  f.db.expense.findUnique.mockResolvedValue({ id: 'expense' } as never);
  await f.caller.discardCorrection({ receiptId: 'receipt', groupId: 'group', token: p.token });
  expect(f.db.systemSetting.deleteMany).toHaveBeenCalledOnce();
  expect(f.db.receipt.updateMany).not.toHaveBeenCalled();
  expect(f.db.receiptItem.deleteMany).not.toHaveBeenCalled();
});

test.each(['items', 'assignments', 'currency', 'version', 'finalized', 'archived', 'expired', 'conditional write'])(
  'confirm refuses %s changes',
  async (kind) => {
    const f = fixture();
    const p = await f.caller.previewCorrection(f.input);
    if (kind === 'items') f.receipt.items[0]!.totalPrice++;
    if (kind === 'assignments') f.receipt.items[0]!.assignments = [];
    if (kind === 'currency') f.receipt.extractedData.currency = 'USD';
    if (kind === 'version') f.receipt.updatedAt = new Date('2026-10-05T11:00:00Z');
    if (kind === 'finalized') f.db.expense.findUnique.mockResolvedValue({ id: 'expense' } as never);
    if (kind === 'archived') f.receipt.group.archivedAt = new Date() as never;
    if (kind === 'expired') vi.spyOn(Date, 'now').mockReturnValue(p.expiresAt + 1);
    if (kind === 'conditional write') f.db.receipt.updateMany.mockResolvedValue({ count: 0 });
    try {
      await expect(
        f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'group', token: p.token }),
      ).rejects.toMatchObject({ code: ['finalized', 'archived'].includes(kind) ? 'BAD_REQUEST' : 'CONFLICT' });
    } finally {
      vi.restoreAllMocks();
    }
    expect(f.db.receiptItem.deleteMany).not.toHaveBeenCalled();
  },
);

test('preview reauthorizes after provider execution; lost membership or a competing item edit cannot persist a candidate', async () => {
  const f = fixture();
  extract.mockImplementationOnce(async () => {
    f.receipt.items[0]!.totalPrice++;
    return { extraction, provider: 'mock' };
  });
  await expect(f.caller.previewCorrection(f.input)).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(f.db.systemSetting.upsert).not.toHaveBeenCalled();
  f.receipt.group.members = [];
  await expect(f.caller.previewCorrection(f.input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('strict confirmation accepts only server token; wrong group, replaced token and missing authorization fail', async () => {
  const f = fixture();
  const p = await f.caller.previewCorrection(f.input);
  const q = await f.caller.previewCorrection(f.input);
  await expect(
    f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'group', token: p.token }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'other', token: q.token }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(
    f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'group', token: q.token, extraction } as never),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  f.receipt.group.members = [];
  await expect(
    f.caller.confirmCorrection({ receiptId: 'receipt', groupId: 'group', token: q.token }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.db.receipt.updateMany).not.toHaveBeenCalled();
});

test('provider errors and invalid extraction cannot mutate originals; legacy correction path is rejected', async () => {
  const f = fixture();
  extract.mockRejectedValueOnce(new Error('private provider error'));
  await expect(f.caller.previewCorrection(f.input)).rejects.toMatchObject({
    message: 'Correction preview failed. Please try again.',
  });
  extract.mockResolvedValueOnce({ extraction: { ...extraction, total: -1 }, provider: 'mock' });
  await expect(f.caller.previewCorrection(f.input)).rejects.toThrow();
  await expect(f.caller.processReceipt(f.input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  expect(f.db.receipt.updateMany).not.toHaveBeenCalled();
  expect(f.db.systemSetting.upsert).not.toHaveBeenCalled();
});
