import { expect, test, vi } from 'vitest';
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

// One person can have several units of a line (2 of 3 coffees): the shares follow the units.
function fixture() {
  const receipt = {
    id: 'receipt',
    uploadedById: 'user',
    status: 'COMPLETED',
    groupId: 'group',
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    group: { members: [{ userId: 'user' }] },
    extractedData: {
      currency: 'EUR',
      date: '2026-10-01',
      total: 3000,
      subtotal: 3000,
      tax: 0,
      tip: 0,
      alternateTotals: [],
    },
    items: [{ id: 'coffee', totalPrice: 3000 }],
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
      findUniqueOrThrow: vi.fn(async () => receipt),
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
  const base = { groupId: 'group', receiptId: 'receipt', title: 'Coffee', paidById: 'user' };
  return { caller, db, base };
}

test('shares follow the units each person had', async () => {
  const { caller, db, base } = fixture();
  await caller.assignItemsAndCreateExpense({
    ...base,
    assignments: [{ receiptItemId: 'coffee', userIds: ['user', 'friend'], weights: [2, 1] }],
  });
  const data = (
    db.expense.create.mock.calls[0] as unknown as [
      { data: { shares: { create: { userId: string; amount: number }[] } } },
    ]
  )[0].data;
  const byUser = Object.fromEntries(data.shares.create.map((s) => [s.userId, s.amount]));
  expect(byUser).toEqual({ user: 2000, friend: 1000 });
});

test('the units are stored with the assignment', async () => {
  const { caller, db, base } = fixture();
  await caller.assignItemsAndCreateExpense({
    ...base,
    assignments: [{ receiptItemId: 'coffee', userIds: ['user', 'friend'], weights: [2, 1] }],
  });
  expect(db.receiptItemAssignment.createMany).toHaveBeenCalledWith(
    expect.objectContaining({
      data: [
        { receiptItemId: 'coffee', userId: 'user', shareOfItem: 2 },
        { receiptItemId: 'coffee', userId: 'friend', shareOfItem: 1 },
      ],
    }),
  );
});

test('without units the line is split equally as before', async () => {
  const { caller, db, base } = fixture();
  await caller.assignItemsAndCreateExpense({
    ...base,
    assignments: [{ receiptItemId: 'coffee', userIds: ['user', 'friend'] }],
  });
  const data = (
    db.expense.create.mock.calls[0] as unknown as [
      { data: { shares: { create: { userId: string; amount: number }[] } } },
    ]
  )[0].data;
  expect(Object.fromEntries(data.shares.create.map((s) => [s.userId, s.amount]))).toEqual({ user: 1500, friend: 1500 });
});

test('units that do not match the people are refused', async () => {
  const { caller, base } = fixture();
  await expect(
    caller.assignItemsAndCreateExpense({
      ...base,
      assignments: [{ receiptItemId: 'coffee', userIds: ['user', 'friend'], weights: [2] }],
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
