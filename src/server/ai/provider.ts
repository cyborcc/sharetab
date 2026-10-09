import type { ReceiptExtractionResult } from './schema';

export interface ExtractReceiptOptions {
  /** English name of the language item names should be written in ("German"); the receipt is translated into it. */
  language?: string | undefined;
}

export interface AIProvider {
  readonly name: string;

  /**
   * Extract structured data from a receipt image.
   * @param imageBuffer - Raw image bytes
   * @param mimeType - e.g., "image/jpeg", "image/png"
   * @param correctionHint - user correction to apply
   * @param options - e.g. the language to translate item names into
   * @returns Structured receipt data
   */
  extractReceipt(
    imageBuffer: Buffer,
    mimeType: string,
    correctionHint?: string,
    options?: ExtractReceiptOptions,
  ): Promise<ReceiptExtractionResult>;

  /**
   * Check if this provider is configured and available.
   */
  isAvailable(): Promise<boolean>;
}
