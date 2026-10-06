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

// Editing an expense that was created from a receipt scan: the expense, its shares and the item
// assignments are replaced. Before, the edit form turned it into a plain split and dropped the items.
function fixture(over: { role?: string; existing?: Record<string, unknown> | null } = {}) {
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
    items: [
      { id: 'a', totalPrice: 1000 },
      { id: 'b', totalPrice: 2000 },
    ],
  };
  const existing =
    over.existing === undefined
      ? { receiptId: 'receipt', splitMode: 'ITEM', paidById: 'user', addedById: 'user' }
      : over.existing;
  const db = {
    user: { findUnique: vi.fn(async () => ({ suspendedAt: null })) },
    group: {
      findUnique: vi.fn(async () => ({ currency: 'EUR', archivedAt: null })),
      findUniqueOrThrow: vi.fn(async () => ({ currency: 'EUR' })),
    },
    groupMember: {
      findUnique: vi.fn(async () => ({ role: over.role ?? 'MEMBER' })),
      findMany: vi.fn(async () => [{ userId: 'user' }, { userId: 'friend' }]),
    },
    receipt: {
      findUnique: vi.fn(async () => receipt),
      findUniqueOrThrow: vi.fn(async () => receipt),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    expense: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => existing),
      create: vi.fn(async ({ data }) => ({ id: 'new', ...data })),
      update: vi.fn(async ({ data }) => ({ id: 'expense', ...data })),
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
    expenseId: 'expense',
    title: 'Dinner (korrigiert)',
    paidById: 'friend',
    assignments: [
      { receiptItemId: 'a', userIds: ['user', 'friend'] },
      { receiptItemId: 'b', userIds: ['friend'] },
    ],
  };
  return { caller, db, input };
}

test('editing updates the expense and replaces its shares instead of creating a second expense', async () => {
  const { caller, db, input } = fixture();
  const result = await caller.assignItemsAndCreateExpense(input);
  expect(db.expense.create).not.toHaveBeenCalled();
  expect(db.expense.update).toHaveBeenCalledTimes(1);
  const data = (
    db.expense.update.mock.calls[0] as unknown as [{ where: { id: string }; data: Record<string, unknown> }]
  )[0];
  expect(data.where).toEqual({ id: 'expense' });
  expect(data.data).toMatchObject({
    title: 'Dinner (korrigiert)',
    amount: 3000,
    paidById: 'friend',
    placeName: null,
    latitude: null,
  });
  expect(data.data.shares).toMatchObject({ deleteMany: {} });
  const created = (data.data.shares as { create: { userId: string; amount: number }[] }).create;
  expect(created.reduce((s, x) => s + x.amount, 0)).toBe(3000);
  expect(new Set(created.map((x) => x.userId))).toEqual(new Set(['user', 'friend']));
  expect(result).toMatchObject({ id: 'expense', amount: 3000 });
});

test('editing clears the assignments of every item of the receipt, then writes the new ones', async () => {
  const { caller, db, input } = fixture();
  await caller.assignItemsAndCreateExpense({
    ...input,
    assignments: [
      { receiptItemId: 'a', userIds: ['user'] },
      { receiptItemId: 'b', userIds: ['user'] },
    ],
  });
  expect(db.receiptItemAssignment.deleteMany).toHaveBeenCalledWith({ where: { receiptItemId: { in: ['a', 'b'] } } });
  expect(db.receiptItemAssignment.createMany).toHaveBeenCalledTimes(1);
});

test('editing is logged as an update', async () => {
  const { caller, db, input } = fixture();
  await caller.assignItemsAndCreateExpense(input);
  expect(db.activityLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ type: 'EXPENSE_UPDATED', entityId: 'expense' }),
  });
});

test('without expenseId a new expense is still created', async () => {
  const { caller, db, input } = fixture();
  const { expenseId: _unused, ...create } = input;
  void _unused;
  await caller.assignItemsAndCreateExpense(create);
  expect(db.expense.create).toHaveBeenCalledTimes(1);
  expect(db.expense.update).not.toHaveBeenCalled();
});

test('an expense that belongs to another receipt or is not an item split is refused', async () => {
  const other = fixture({ existing: { receiptId: 'other', splitMode: 'ITEM', paidById: 'user', addedById: 'user' } });
  await expect(other.caller.assignItemsAndCreateExpense(other.input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  const equal = fixture({
    existing: { receiptId: 'receipt', splitMode: 'EQUAL', paidById: 'user', addedById: 'user' },
  });
  await expect(equal.caller.assignItemsAndCreateExpense(equal.input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  const missing = fixture({ existing: null });
  await expect(missing.caller.assignItemsAndCreateExpense(missing.input)).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  expect(other.db.expense.update).not.toHaveBeenCalled();
});

test('only the creator, the payer or an owner/admin may edit', async () => {
  const stranger = fixture({
    existing: { receiptId: 'receipt', splitMode: 'ITEM', paidById: 'friend', addedById: 'friend' },
  });
  await expect(stranger.caller.assignItemsAndCreateExpense(stranger.input)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(stranger.db.expense.update).not.toHaveBeenCalled();
  const admin = fixture({
    role: 'ADMIN',
    existing: { receiptId: 'receipt', splitMode: 'ITEM', paidById: 'friend', addedById: 'friend' },
  });
  await expect(admin.caller.assignItemsAndCreateExpense(admin.input)).resolves.toMatchObject({ id: 'expense' });
});
