import { expect, test, vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/server/lib/receipt-processor', () => ({ processReceiptImage: vi.fn() }));
vi.mock('@/server/ai/registry', () => ({
  getAIProvidersWithFallback: vi.fn(),
  getConfiguredProviderPriority: vi.fn(),
  getSelectableModels: vi.fn(() => ['Qwen38.S', 'inferenz-mistral-small-4-119b']),
}));
import { receiptsRouter } from './receipts';
import type { TRPCContext } from '../init';

// The receipt history: who changed which line and when, and which category a scan is filed under.
function fixture(assignments: { userId: string; shareOfItem: number }[] = []) {
  const items = [
    { id: 'coffee', name: 'Cappuccino', quantity: 3, unitPrice: 1000, totalPrice: 3000, sortOrder: 0, assignments },
  ];
  const receipt = {
    id: 'receipt',
    uploadedById: 'user',
    status: 'COMPLETED',
    groupId: 'group',
    imagePath: 'r.jpg',
    mimeType: 'image/jpeg',
    updatedAt: new Date('2026-10-05T10:00:00Z'),
    group: { members: [{ userId: 'user' }, { userId: 'friend' }] },
    extractedData: {
      currency: 'EUR',
      date: '2026-10-01',
      total: 3000,
      subtotal: 3000,
      tax: 0,
      tip: 0,
      alternateTotals: [],
    },
    items,
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
    receiptItem: {
      findUnique: vi.fn(async () => items[0]),
      update: vi.fn(async ({ data }) => ({ ...items[0], ...data })),
    },
    expense: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => ({
        receiptId: 'receipt',
        splitMode: 'ITEM',
        paidById: 'user',
        addedById: 'user',
        title: 'Cafe',
        amount: 3000,
        category: null,
        placeName: null,
        shares: [],
      })),
      create: vi.fn(async ({ data }) => ({ id: 'new', ...data })),
      update: vi.fn(async ({ data }) => ({ id: 'expense', ...data })),
    },
    receiptItemAssignment: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    activityLog: { create: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
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
  const base = { groupId: 'group', receiptId: 'receipt', title: 'Cafe', paidById: 'user' };
  return { caller, db, base };
}

const loggedChanges = (db: ReturnType<typeof fixture>['db']) =>
  (db.activityLog.create.mock.calls as unknown as [{ data: { type: string; metadata: Record<string, unknown> } }][])
    .map(([arg]) => arg.data)
    .filter((d) => d.type === 'RECEIPT_ITEMS_CHANGED');

test('editing a line records what it was and what it became', async () => {
  const { caller, db } = fixture();
  await caller.updateItem({ itemId: 'coffee', quantity: 2, totalPrice: 2000, unitPrice: 1000 });
  expect(loggedChanges(db)).toEqual([
    expect.objectContaining({
      metadata: {
        receiptId: 'receipt',
        action: 'update',
        itemId: 'coffee',
        itemName: 'Cappuccino',
        before: { name: 'Cappuccino', quantity: 3, totalPrice: 3000 },
        after: { name: 'Cappuccino', quantity: 2, totalPrice: 2000 },
      },
    }),
  ]);
});

test('saving a line unchanged records nothing', async () => {
  const { caller, db } = fixture();
  await caller.updateItem({ itemId: 'coffee', name: 'Cappuccino' });
  expect(loggedChanges(db)).toEqual([]);
});

test('reassigning a line on edit records who had it before and after', async () => {
  const { caller, db, base } = fixture([{ userId: 'user', shareOfItem: 3 }]);
  await caller.assignItemsAndCreateExpense({
    ...base,
    expenseId: 'expense',
    assignments: [{ receiptItemId: 'coffee', userIds: ['user', 'friend'], weights: [2, 1] }],
  });
  const [assign] = loggedChanges(db);
  expect(assign?.metadata).toEqual({
    receiptId: 'receipt',
    action: 'assign',
    changes: [{ itemId: 'coffee', itemName: 'Cappuccino', before: { user: 3 }, after: { user: 2, friend: 1 } }],
  });
});

test('the first assignment of a fresh scan is not a change', async () => {
  const { caller, db, base } = fixture();
  await caller.assignItemsAndCreateExpense({
    ...base,
    assignments: [{ receiptItemId: 'coffee', userIds: ['user'] }],
  });
  expect(loggedChanges(db)).toEqual([]);
});

test('the category of a scan is stored and its change shows in the expense log', async () => {
  const { caller, db, base } = fixture([{ userId: 'user', shareOfItem: 1 }]);
  await caller.assignItemsAndCreateExpense({
    ...base,
    expenseId: 'expense',
    category: 'Essen',
    assignments: [{ receiptItemId: 'coffee', userIds: ['user'] }],
  });
  expect(db.expense.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ category: 'Essen' }) }),
  );
  expect(db.activityLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      type: 'EXPENSE_UPDATED',
      metadata: expect.objectContaining({ receiptId: 'receipt', changes: { category: [null, 'Essen'] } }),
    }),
  });
});

test('a new scan expense gets the chosen category', async () => {
  const { caller, db, base } = fixture();
  await caller.assignItemsAndCreateExpense({
    ...base,
    category: 'Essen',
    assignments: [{ receiptItemId: 'coffee', userIds: ['user'] }],
  });
  expect(db.expense.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ category: 'Essen' }) }),
  );
});

test('a model that is not offered is refused before scanning', async () => {
  const { caller } = fixture();
  await expect(caller.processReceipt({ receiptId: 'receipt', model: 'gpt-5-secret' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
});
