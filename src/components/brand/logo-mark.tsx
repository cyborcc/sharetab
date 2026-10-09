import { cn } from '@/lib/utils';

/** The Splitbon mark: one receipt torn in two. Follows the theme (dark/light) and the accent colour. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="12 8 72 90" className={cn('shrink-0', className)} aria-hidden="true">
      <path
        className="fill-foreground"
        d="M22 12 H48 V84 L44.75 88 L41.5 84 L38.25 88 L35 84 L31.75 88 L28.5 84 L25.25 88 L22 84 Z"
      />
      <path
        className="fill-primary"
        d="M52 18 H78 V90 L74.75 94 L71.5 90 L68.25 94 L65 90 L61.75 94 L58.5 90 L55.25 94 L52 90 Z"
      />
      <rect className="fill-background" x="28" y="26" width="14" height="4" rx="2" />
      <rect className="fill-background" x="28" y="36" width="9" height="4" rx="2" />
      <rect className="fill-background" x="58" y="32" width="14" height="4" rx="2" />
      <rect className="fill-background" x="58" y="42" width="9" height="4" rx="2" />
    </svg>
  );
}
