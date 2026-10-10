import { defaultLocale, type Locale } from '@/i18n/routing';

/** Maximum monetary value in cents — Postgres int4 max, the DB column type for all money fields. */
export const MAX_MONEY_CENTS = 2_147_483_647;

const moneyLocales: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  sv: 'sv-SE',
  fr: 'fr-FR',
  de: 'de-DE',
  'pt-BR': 'pt-BR',
  ja: 'ja-JP',
  'zh-CN': 'zh-CN',
  ko: 'ko-KR',
} satisfies Record<Locale, string>;

export function formatCents(cents: number, currency = 'USD', locale: string = defaultLocale): string {
  return new Intl.NumberFormat(moneyLocales[locale] ?? locale, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function parseToCents(value: string): number {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) return 0;
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const dotIndex = abs.lastIndexOf('.');
  if (dotIndex === -1) return (parseInt(abs, 10) || 0) * 100 * (negative ? -1 : 1);
  const intPart = abs.slice(0, dotIndex) || '0';
  const fracPart = abs
    .slice(dotIndex + 1)
    .padEnd(2, '0')
    .slice(0, 2);
  const cents = (parseInt(intPart, 10) || 0) * 100 + parseInt(fracPart, 10);
  return cents * (negative ? -1 : 1);
}

/**
 * Reads an amount typed by a person, with a decimal comma or a decimal point ("12,50", "12.5", "1.234,50").
 * A separator followed by exactly three digits counts as a thousands separator, any other as the decimal mark.
 * Returns 0 for anything that is not an amount.
 */
export function parseAmountInput(value: string): number {
  const s = value.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$|^[.,]\d+$/.test(s)) return 0;
  const sep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (sep === -1) return parseToCents(s);
  const decimals = s.slice(sep + 1);
  const intPart = s.slice(0, sep).replace(/[.,]/g, '');
  if (decimals.length === 3 && intPart !== '') return parseToCents(intPart + decimals);
  return parseToCents(`${intPart || '0'}.${decimals}`);
}

/** Keeps only what an amount field can hold, so a stray letter or sign never reaches the state. */
export function sanitizeAmountInput(value: string): string {
  return value.replace(/[^\d.,]/g, '');
}

export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}
