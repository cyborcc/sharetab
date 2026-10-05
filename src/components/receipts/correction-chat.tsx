'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ReceiptExtractionResult } from '@/server/ai/schema';

type Preview = {
  token: string;
  extraction: ReceiptExtractionResult;
  original: {
    extractedData: unknown;
    items: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
  };
};
// Render money in its original currency, never silently convert a proposal.
function Summary({
  data,
  items,
}: {
  data: Record<string, unknown>;
  items: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
}) {
  const t = useTranslations('expenses.scan.correction');
  const money = (value: unknown) => `${(Number(value ?? 0) / 100).toFixed(2)} ${String(data.currency ?? '')}`;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {String(data.merchantName ?? '')} {String(data.date ?? '')}
      </p>
      <ul>
        {items.map((item, i) => (
          <li key={i}>
            {item.quantity} × {item.name} · {money(item.unitPrice)} → {money(item.totalPrice)}
          </li>
        ))}
      </ul>
      <p>
        {t('subtotal')}: {money(data.subtotal)}
      </p>
      <p>
        {t('tax')}: {money(data.tax)}
      </p>
      <p>
        {t('tip')}: {money(data.tip)}
      </p>
      <p className="font-semibold">
        {t('total')}: {money(data.total)}
      </p>
    </div>
  );
}

export function CorrectionChat({
  receiptId,
  groupId,
  onApplied,
  onBlocked,
}: {
  receiptId: string;
  groupId: string;
  onApplied: () => Promise<void>;
  onBlocked: (value: boolean) => void;
}) {
  const t = useTranslations('expenses.scan.correction');
  const [hint, setHint] = useState('');
  const [request, setRequest] = useState('');
  const [proposal, setProposal] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = trpc.receipts.previewCorrection.useMutation();
  const confirm = trpc.receipts.confirmCorrection.useMutation();
  const discard = trpc.receipts.discardCorrection.useMutation();
  async function send() {
    setBusy(true);
    onBlocked(true);
    setMessage('');
    setRequest(hint.trim());
    try {
      setProposal(await preview.mutateAsync({ receiptId, groupId, correctionHint: hint.trim() }));
    } catch {
      setMessage(t('failed'));
      onBlocked(false);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(apply: boolean) {
    if (!proposal) return;
    setBusy(true);
    setMessage('');
    try {
      const input = { receiptId, groupId, token: proposal.token };
      if (apply) {
        await confirm.mutateAsync(input);
        await onApplied();
      } else await discard.mutateAsync(input);
      setProposal(null);
      setHint('');
      setMessage(t(apply ? 'applied' : 'discarded'));
      onBlocked(false);
    } catch {
      setMessage(t('stale'));
      // A rejected/replaced proposal must not trap the form in a disabled state.
      setProposal(null);
      onBlocked(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card data-testid="receipt-correction-chat">
      <CardContent className="space-y-3 pt-4">
        <h2 className="font-semibold">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        {request && (
          <p className="rounded bg-muted p-2 text-sm" data-testid="correction-request">
            {request}
          </p>
        )}
        <div aria-live="polite">
          {busy && <p>{t('working')}</p>}
          {message && <p role="status">{message}</p>}
          {proposal && (
            <div data-testid="correction-preview" className="space-y-3">
              <p>{t('review')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-semibold">{t('original')}</h3>
                  <Summary
                    data={(proposal.original.extractedData ?? {}) as Record<string, unknown>}
                    items={proposal.original.items}
                  />
                </div>
                <div>
                  <h3 className="font-semibold">{t('proposed')}</h3>
                  <Summary data={proposal.extraction} items={proposal.extraction.items} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t('resetWarning')}</p>
              <Button data-testid="correction-apply" disabled={busy} onClick={() => resolve(true)}>
                {t('apply')}
              </Button>{' '}
              <Button data-testid="correction-discard" variant="outline" disabled={busy} onClick={() => resolve(false)}>
                {t('discard')}
              </Button>
            </div>
          )}
        </div>
        {!proposal && (
          <>
            <label htmlFor="correction-hint">{t('request')}</label>
            <textarea
              id="correction-hint"
              data-testid="correction-hint"
              value={hint}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setHint(e.target.value)}
              className="w-full rounded border p-2"
              rows={3}
            />
            <Button data-testid="correction-send" disabled={busy || !hint.trim()} onClick={send}>
              {t('preview')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
