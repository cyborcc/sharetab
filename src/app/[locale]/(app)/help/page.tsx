import { getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STEPS = ['create', 'invite', 'scan', 'settle'] as const;
const VIDEOS: Record<(typeof STEPS)[number], string> = {
  create: '/help/create-group.mp4',
  invite: '/help/invite-members.mp4',
  scan: '/help/receipt-scan.mp4',
  settle: '/help/settle-up.mp4',
};

/** The README's walkthrough inside the app: four steps, each with a short looping demo. */
export default async function HelpPage() {
  const t = await getTranslations('help');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {STEPS.map((step, i) => (
          <Card key={step} data-testid={`help-step-${step}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                {t(`${step}.title`)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t(`${step}.text`)}</p>
              <video
                src={VIDEOS[step]}
                aria-label={t('videoLabel')}
                className="mx-auto max-h-[420px] rounded-lg border"
                autoPlay
                loop
                muted
                playsInline
                preload="none"
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <a
        href="https://github.com/cyborcc/sharetab#readme"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t('more')}
      </a>
    </div>
  );
}
