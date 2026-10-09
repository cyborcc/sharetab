import type { AIProvider, ExtractReceiptOptions } from '../provider';
import type { ReceiptExtractionResult } from '../schema';
import { receiptExtractionSchema } from '../schema';
import { buildReceiptPrompt } from '../prompts/receipt-extraction';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model = 'llava') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async extractReceipt(
    imageBuffer: Buffer,
    _mimeType: string,
    correctionHint?: string,
    options: ExtractReceiptOptions = {},
  ): Promise<ReceiptExtractionResult> {
    const base64 = imageBuffer.toString('base64');
    const prompt = buildReceiptPrompt({ correctionHint, language: options.language });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [base64],
          },
        ],
        stream: false,
        format: 'json',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.message?.content;
    if (!content) {
      throw new Error('Ollama returned empty response');
    }

    // Try direct JSON parse first
    try {
      const raw = JSON.parse(content);
      return receiptExtractionSchema.parse(raw);
    } catch {
      // Fallback: try to extract JSON from the response text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Ollama response');
      }
      const raw = JSON.parse(jsonMatch[0]);
      return receiptExtractionSchema.parse(raw);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
