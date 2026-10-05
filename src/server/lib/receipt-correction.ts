import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { receiptExtractionSchema } from '../ai/schema';
import { extractReceiptImage } from './receipt-processor';
import { normalizeDate } from './normalize-date';
import { isValidCurrency } from './exchange-rates';

const candidateSchema = z.object({
  version: z.literal(1),
  token: z.string().uuid(),
  base: z.string(),
  expiresAt: z.number(),
  provider: z.string(),
  extraction: receiptExtractionSchema,
});
const keyFor = (receiptId: string, userId: string) => `receiptCorrection:${receiptId}:${userId}`;
type DB = PrismaClient | Prisma.TransactionClient;

async function readEditable(db: DB, receiptId: string, groupId: string, userId: string, editable = true) {
  const receipt = await db.receipt.findUnique({
    where: { id: receiptId },
    include: {
      group: { include: { members: true } },
      items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { assignments: { orderBy: { id: 'asc' } } } },
    },
  });
  if (!receipt) throw new TRPCError({ code: 'NOT_FOUND' });
  if (receipt.groupId !== groupId || !receipt.group?.members.some((m) => m.userId === userId))
    throw new TRPCError({ code: 'FORBIDDEN' });
  if (
    editable &&
    (receipt.status !== 'COMPLETED' ||
      receipt.group.archivedAt ||
      (await db.expense.findUnique({ where: { receiptId } })))
  )
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only pending completed receipts can be corrected.' });
  return receipt;
}
function digest(receipt: Awaited<ReturnType<typeof readEditable>>) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        updatedAt: receipt.updatedAt,
        groupId: receipt.groupId,
        paidById: receipt.paidById,
        extractedData: receipt.extractedData,
        rawResponse: receipt.rawResponse,
        items: receipt.items,
      }),
    )
    .digest('hex');
}

export async function previewReceiptCorrection(
  db: PrismaClient,
  receiptId: string,
  groupId: string,
  userId: string,
  hint: string,
) {
  const receipt = await readEditable(db, receiptId, groupId, userId);
  const base = digest(receipt);
  let result: Awaited<ReturnType<typeof extractReceiptImage>>;
  try {
    result = await extractReceiptImage({ receiptId, receipt, correctionHint: hint, logPrefix: 'receipt.preview' });
  } catch {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Correction preview failed. Please try again.' });
  }
  const extraction = receiptExtractionSchema.parse(result.extraction);
  if (!isValidCurrency(extraction.currency))
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid proposed currency.' });
  // A correction cannot carry forward printed exchange totals or accepted rate metadata.
  extraction.alternateTotals = [];
  const candidate = {
    version: 1 as const,
    token: randomUUID(),
    base,
    expiresAt: Date.now() + 30 * 60 * 1000,
    provider: result.provider,
    extraction,
  };
  await db.$transaction(
    async (tx) => {
      const current = await readEditable(tx, receiptId, groupId, userId);
      if (digest(current) !== candidate.base)
        throw new TRPCError({ code: 'CONFLICT', message: 'Receipt changed. Request a new preview.' });
      const key = keyFor(receiptId, userId);
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(candidate) },
        update: { value: JSON.stringify(candidate) },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return {
    token: candidate.token,
    extraction,
    original: { extractedData: receipt.extractedData, items: receipt.items },
    expiresAt: candidate.expiresAt,
  };
}

export async function resolveReceiptCorrection(
  db: PrismaClient,
  receiptId: string,
  groupId: string,
  userId: string,
  token: string,
  apply: boolean,
) {
  return db.$transaction(
    async (tx) => {
      const receipt = await readEditable(tx, receiptId, groupId, userId, apply);
      const key = keyFor(receiptId, userId);
      const stored = await tx.systemSetting.findUnique({ where: { key } });
      let candidate: z.infer<typeof candidateSchema>;
      try {
        candidate = candidateSchema.parse(JSON.parse(stored?.value ?? 'null'));
      } catch {
        throw new TRPCError({ code: 'CONFLICT', message: 'Preview unavailable. Request a new preview.' });
      }
      if (candidate.token !== token)
        throw new TRPCError({ code: 'CONFLICT', message: 'Preview replaced. Request a new preview.' });
      if (apply) {
        if (candidate.expiresAt <= Date.now() || digest(receipt) !== candidate.base)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Receipt changed or preview expired. Request a new preview.',
          });
        const { items, ...data } = candidate.extraction;
        const extractedData = { ...data, date: normalizeDate(data.date), alternateTotals: [] };
        const updated = await tx.receipt.updateMany({
          where: { id: receiptId, groupId, status: 'COMPLETED', updatedAt: receipt.updatedAt, expense: null },
          data: {
            extractedData: extractedData as unknown as Prisma.InputJsonValue,
            rawResponse: candidate.extraction as unknown as Prisma.InputJsonValue,
            aiProvider: candidate.provider,
          },
        });
        if (updated.count !== 1)
          throw new TRPCError({ code: 'CONFLICT', message: 'Receipt changed. Request a new preview.' });
        await tx.receiptItem.deleteMany({ where: { receiptId } });
        await tx.receiptItem.createMany({ data: items.map((item, sortOrder) => ({ ...item, receiptId, sortOrder })) });
      }
      await tx.systemSetting.deleteMany({ where: { key, value: stored!.value } });
      return { success: true };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
