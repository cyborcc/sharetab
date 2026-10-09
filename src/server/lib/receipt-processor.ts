import type { PrismaClient } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';
import type { AIProvider } from '../ai/provider';
import { getAIProvidersWithFallback, clearProviderCache, createProviderForModel } from '../ai/registry';
import { logger } from './logger';
import { normalizeDate } from './normalize-date';

interface ProcessReceiptImageOptions {
  db: PrismaClient;
  receiptId: string;
  receipt: { imagePath: string; mimeType: string };
  correctionHint?: string;
  logPrefix?: string;
  /** Model of the OpenAI-compatible endpoint picked for this scan; the configured chain is the fallback. */
  model?: string;
  /** English name of the language item names are translated into (the user's app language). */
  language?: string;
}

/** Provider name plus model where there is one, e.g. "openai (Qwen38.S)", to see which model read a receipt. */
function providerLabel(provider: AIProvider): string {
  const model = (provider as { model?: unknown }).model;
  return typeof model === 'string' && model ? `${provider.name} (${model})` : provider.name;
}

/**
 * Shared receipt processing logic used by both authenticated and guest flows.
 * Reads the image file, calls the AI provider, creates receipt items in DB,
 * and updates the receipt record with the extraction result.
 */
export async function extractReceiptImage({
  receiptId,
  receipt,
  correctionHint,
  logPrefix = 'receipt',
  model,
  language,
}: Omit<ProcessReceiptImageOptions, 'db'>) {
  const { readFile } = await import('fs/promises');
  const { resolveUploadPath } = await import('./upload-dir');
  const filepath = resolveUploadPath(receipt.imagePath);
  const imageBuffer = await readFile(filepath);

  logger.info(`${logPrefix}.processing`, {
    receiptId,
    imageSize: imageBuffer.length,
    hasCorrectionHint: !!correctionHint,
    language: language ?? null,
  });

  const start = Date.now();
  let provider: AIProvider | null = null;
  let result: Awaited<ReturnType<AIProvider['extractReceipt']>> | null = null;

  for (let pass = 0; pass < 2 && !result; pass++) {
    // A copy: the fallback list is cached and shared between requests.
    const providers = [...(await getAIProvidersWithFallback())];
    if (model && !providers.some((p) => (p as { selectionId?: unknown }).selectionId === model)) {
      providers.unshift(await createProviderForModel(model));
    }

    for (const candidate of providers) {
      try {
        result = await candidate.extractReceipt(imageBuffer, receipt.mimeType, correctionHint, { language });
        provider = candidate;
        break;
      } catch (err) {
        logger.warn(`${logPrefix}.extractFailed`, {
          receiptId,
          provider: providerLabel(candidate),
          pass,
          error: err instanceof Error ? err.message.slice(0, 300) : 'Unknown',
        });
      }
    }

    if (!result && pass === 0) {
      // Cache can become stale after auth expiration; refresh once and retry all providers.
      clearProviderCache();
    }
  }

  if (!result || !provider) {
    throw new Error('Receipt extraction failed across configured providers.');
  }
  const extraction = result;
  const usedProvider = provider;

  logger.info(`${logPrefix}.extracted`, {
    receiptId,
    provider: providerLabel(usedProvider),
    items: extraction.items.length,
    durationMs: Date.now() - start,
  });

  return { extraction, provider: providerLabel(usedProvider) };
}

export async function processReceiptImage(options: ProcessReceiptImageOptions) {
  const { db, receiptId } = options;
  const { extraction, provider } = await extractReceiptImage(options);
  const normalizedDate = normalizeDate(extraction.date);

  // Replace items and finalize the receipt atomically — a crash or a
  // concurrent reprocess must never leave a COMPLETED receipt with missing
  // or duplicated items.
  await db.$transaction(async (tx) => {
    await tx.receiptItem.deleteMany({ where: { receiptId } });

    await tx.receiptItem.createMany({
      data: extraction.items.map((item, i) => ({
        receiptId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        sortOrder: i,
      })),
    });

    await tx.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'COMPLETED',
        aiProvider: provider,
        rawResponse: extraction as unknown as Prisma.InputJsonValue,
        extractedData: {
          merchantName: extraction.merchantName,
          date: normalizedDate,
          subtotal: extraction.subtotal,
          tax: extraction.tax,
          tip: extraction.tip,
          total: extraction.total,
          currency: extraction.currency,
          alternateTotals: extraction.alternateTotals,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  });

  return {
    status: 'COMPLETED' as const,
    merchantName: extraction.merchantName,
    date: normalizedDate,
    subtotal: extraction.subtotal,
    tax: extraction.tax,
    tip: extraction.tip,
    total: extraction.total,
    currency: extraction.currency,
    itemCount: extraction.items.length,
  };
}
