'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/clipboard';
import { formatCents } from '@/lib/money';
import { buildEpcQrPayload, formatIban } from '@/lib/payments';

function CopyRow({
  label,
  value,
  copyValue,
  testId,
}: {
  label: string;
  value: string;
  copyValue: string;
  testId: string;
}) {
  const t = useTranslations('groups');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!(await copyToClipboard(copyValue))) {
      toast.error(t('payment.copyFailed'));
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-all text-sm font-medium" data-testid={testId}>
          {value}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={handleCopy} aria-label={t('payment.copy')}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

/**
 * Bank transfer details for settling a debt. For euro groups it shows an EPC QR code
 * ("GiroCode") that banking apps scan to prefill recipient, IBAN, amount and reference.
 */
export function BankTransferDialog({
  open,
  onOpenChange,
  holder,
  iban,
  amountCents,
  currency,
  reference,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holder: string;
  iban: string;
  amountCents: number;
  currency: string;
  reference: string;
  onPaid: () => void;
}) {
  const t = useTranslations('groups');
  const locale = useLocale();
  const payload = currency === 'EUR' ? buildEpcQrPayload({ name: holder, iban, amountCents, reference }) : null;
  const amount = formatCents(amountCents, currency, locale);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('payment.bankTitle')}</DialogTitle>
          <DialogDescription>{payload ? t('payment.bankScanHint') : t('payment.bankManualHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {payload && (
            <div className="flex justify-center rounded-xl bg-white p-3" data-testid="epc-qr">
              <QRCodeSVG value={payload} size={208} level="M" marginSize={0} />
            </div>
          )}
          <CopyRow label={t('payment.holder')} value={holder} copyValue={holder} testId="bank-holder" />
          <CopyRow label="IBAN" value={formatIban(iban)} copyValue={iban} testId="bank-iban" />
          <CopyRow
            label={t('payment.amount')}
            value={amount}
            copyValue={(amountCents / 100).toFixed(2)}
            testId="bank-amount"
          />
          <CopyRow label={t('payment.reference')} value={reference} copyValue={reference} testId="bank-reference" />
          <Button type="button" className="w-full" onClick={onPaid} data-testid="bank-paid">
            {t('payment.markPaid')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
