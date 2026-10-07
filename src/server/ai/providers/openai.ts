import OpenAI from 'openai';
import type { AIProvider } from '../provider';
import type { ReceiptExtractionResult } from '../schema';
import { receiptExtractionSchema } from '../schema';
import { RECEIPT_EXTRACTION_PROMPT } from '../prompts/receipt-extraction';

export class OpenAIProvider implements AIProvider {
  readonly name: string;
  private client: OpenAI;
  readonly model: string;
  /** What a user picks in the scan dialog to get this provider and model (see getSelectableModels). */
  readonly selectionId: string;

  /**
   * `baseURL` points the client at another OpenAI-compatible endpoint (default: OPENAI_BASE_URL or
   * OpenAI itself); `name` is how it shows up in logs and receipts.
   */
  constructor(apiKey: string, model?: string, options: { baseURL?: string; name?: string; selectionId?: string } = {}) {
    this.client = new OpenAI({ apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
    this.model = model ?? 'gpt-4o';
    this.name = options.name ?? 'openai';
    this.selectionId = options.selectionId ?? this.model;
  }

  async extractReceipt(
    imageBuffer: Buffer,
    mimeType: string,
    correctionHint?: string,
  ): Promise<ReceiptExtractionResult> {
    const base64 = imageBuffer.toString('base64');
    const prompt = correctionHint
      ? `${RECEIPT_EXTRACTION_PROMPT}\n\nThe user has provided a correction. Apply it to improve accuracy:\n<user_correction>${correctionHint.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</user_correction>`
      : RECEIPT_EXTRACTION_PROMPT;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    const raw = JSON.parse(content);
    return receiptExtractionSchema.parse(raw);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
