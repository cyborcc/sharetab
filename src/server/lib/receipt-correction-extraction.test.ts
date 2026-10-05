import { expect, test, vi } from 'vitest';
vi.mock('fs/promises', () => ({ readFile: vi.fn(async () => Buffer.from('test image')) }));
vi.mock('./upload-dir', () => ({ resolveUploadPath: vi.fn(() => '/fake/test.png') }));
vi.mock('./logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('../ai/registry', async () => {
  const { MockProvider } = await import('../ai/providers/mock');
  return { getAIProvidersWithFallback: vi.fn(async () => [new MockProvider()]), clearProviderCache: vi.fn() };
});
import { extractReceiptImage } from './receipt-processor';
import { logger } from './logger';

test('read-only extraction calls the deterministic mock provider with correction hint and never logs the hint', async () => {
  const result = await extractReceiptImage({
    receiptId: 'test',
    receipt: { imagePath: '/uploads/test.png', mimeType: 'image/png' },
    correctionHint: 'private correction',
  });
  expect(result.provider).toBe('mock');
  expect(result.extraction.items.at(-1)?.name).toBe('Corrected Item');
  expect(result.extraction.total).toBeGreaterThan(0);
  expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain('private correction');
});
