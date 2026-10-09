import type { PrismaClient } from '@/generated/prisma/client';
import { languageNameForLocale } from '../ai/prompts/receipt-extraction';

/**
 * English name of the user's app language ("German"), which receipts are translated into.
 * Best effort: without a user, a lookup failure or an unknown locale the receipt is left as printed.
 */
export async function getUserPromptLanguage(db: PrismaClient, userId: string): Promise<string | undefined> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { locale: true } });
    return languageNameForLocale(user?.locale);
  } catch {
    return undefined;
  }
}
