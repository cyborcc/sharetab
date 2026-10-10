'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const KOFI_URL = 'https://ko-fi.com/aks';
// Ko-fi's own embeddable donation panel: amount, optional message and pay button, no profile page around it
const KOFI_EMBED_URL = `${KOFI_URL}/?hidefeed=true&widget=true&embed=true`;

/** Tip jar: Ko-fi's donation form inside the app, so there is nothing to find on their page. */
export function SupportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md" data-testid="support-dialog">
        <DialogHeader>
          <DialogTitle>{t('sponsor.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('sponsor.dialogHint')}</DialogDescription>
        </DialogHeader>
        {/* Only mounted while the dialog is open, so Ko-fi is not contacted until someone asks */}
        <iframe
          src={KOFI_EMBED_URL}
          title={t('sponsor.dialogTitle')}
          className="h-[680px] max-h-[65dvh] w-full rounded-md border-0 bg-white"
          data-testid="support-iframe"
        />
        <a
          href={KOFI_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          data-testid="support-open-kofi"
        >
          <ExternalLink className="h-3 w-3" />
          {t('sponsor.openKofi')}
        </a>
      </DialogContent>
    </Dialog>
  );
}
