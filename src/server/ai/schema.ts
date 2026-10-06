import { z } from 'zod';

// Cap individual extracted money fields well below the Int4 column limit so a
// hallucinated or prompt-injected value can't overflow the DB or silently
// inflate expense shares. $10M in cents is far beyond any plausible receipt.
const MAX_RECEIPT_CENTS = 1_000_000_000;

const moneyCents = z.number().int().min(0).max(MAX_RECEIPT_CENTS);

// The prompt asks the model for "null" when it cannot read a value, and models also send null for
// missing tax or tip lines. null means "not there", the same as leaving the field out.
const nullAsMissing = (v: unknown) => v ?? undefined;

const currencyCode = z
  .string()
  .max(10)
  .transform((c) => (/^[a-zA-Z]{3}$/.test(c.trim()) ? c.trim().toUpperCase() : 'USD'));

export const receiptItemSchema = z.object({
  name: z.string().max(500),
  quantity: z.number().int().min(1).max(10_000).default(1),
  unitPrice: moneyCents, // cents
  totalPrice: moneyCents, // cents
});

export const receiptExtractionSchema = z.object({
  merchantName: z.preprocess(nullAsMissing, z.string().max(500).optional()),
  // street, postal code and city as printed on the receipt; used to find the place on the map
  merchantAddress: z.preprocess(nullAsMissing, z.string().max(500).optional()),
  date: z.preprocess(nullAsMissing, z.string().max(100).optional()),
  items: z.array(receiptItemSchema).min(1).max(500),
  subtotal: moneyCents,
  tax: z.preprocess(nullAsMissing, moneyCents.default(0)),
  tip: z.preprocess(nullAsMissing, moneyCents.default(0)),
  total: moneyCents,
  // Normalize to an uppercase ISO 4217-shaped code: downstream UI passes this
  // into Intl.NumberFormat, which throws for malformed currency strings.
  currency: z.preprocess(nullAsMissing, currencyCode.default('USD')),
  // Some receipts print their final total in a second currency. Preserve those
  // merchant-provided values so a matching group currency can use the printed
  // conversion instead of a third-party exchange-rate estimate.
  alternateTotals: z.preprocess(
    nullAsMissing,
    z
      .array(
        z.object({
          currency: currencyCode,
          total: moneyCents,
        }),
      )
      .max(10)
      .default([]),
  ),
  confidence: z.number().min(0).max(1).optional(),
});

export type ReceiptItem = z.infer<typeof receiptItemSchema>;
export type ReceiptExtractionResult = z.infer<typeof receiptExtractionSchema>;
