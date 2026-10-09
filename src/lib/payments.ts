/**
 * Payment links and bank-transfer data for settling up: PayPal (e-mail or PayPal.me) and
 * SEPA bank transfer (IBAN, with an EPC QR code that banking apps can scan).
 * Pure helpers, shared by the settings form, the server and the group page.
 */

function formatAmount(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

// ── PayPal ──

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePaypalEmail(email: string): string {
  return email.trim();
}

export function isValidPaypalEmail(email: string): boolean {
  const normalized = normalizePaypalEmail(email);
  return normalized.length > 0 && normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

/**
 * Accepts "name", "@name", "paypal.me/name" or a full PayPal.me link and returns just the name.
 * Returns an empty string for blank input.
 */
export function normalizePaypalMeName(input: string): string {
  let value = input.trim();
  value = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  value = value.replace(/^paypal\.me\//i, '').replace(/^paypal\.com\/paypalme\//i, '');
  value = value.replace(/^@/, '');
  // Drop anything after the name (an amount, a query string, a trailing slash).
  value = value.split(/[/?#]/)[0] ?? '';
  return value.trim();
}

export function isValidPaypalMeName(input: string): boolean {
  return /^[A-Za-z0-9]{1,30}$/.test(normalizePaypalMeName(input));
}

function isCurrencyCode(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency);
}

/** https://www.paypal.me/<name>/<amount><CUR>: opens PayPal with recipient, amount and currency filled in. */
export function buildPaypalMeUrl(name: string, amountCents: number, currency: string): string | null {
  const normalized = normalizePaypalMeName(name);
  if (!isValidPaypalMeName(normalized) || !isCurrencyCode(currency) || amountCents <= 0) return null;
  return `https://www.paypal.me/${normalized}/${formatAmount(amountCents)}${currency}`;
}

/**
 * Payment link for a PayPal account identified by e-mail address. Recipient, amount, currency and
 * the reference text (shown as the item name) are filled in; the payer only has to confirm.
 */
export function buildPaypalEmailUrl(
  email: string,
  amountCents: number,
  currency: string,
  reference: string,
): string | null {
  if (!isValidPaypalEmail(email) || !isCurrencyCode(currency) || amountCents <= 0) return null;
  const params = new URLSearchParams({
    cmd: '_xclick',
    business: normalizePaypalEmail(email),
    amount: formatAmount(amountCents),
    currency_code: currency,
    item_name: reference.slice(0, 127),
    no_shipping: '1',
  });
  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
}

// ── IBAN / SEPA ──

export function normalizeIban(iban: string): string {
  return iban.replace(/[\s-]/g, '').toUpperCase();
}

/** Groups of four, as printed on bank statements. */
export function formatIban(iban: string): string {
  return normalizeIban(iban)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** Structure and ISO 7064 mod-97 check; does not check the per-country length. */
export function isValidIban(iban: string): boolean {
  const normalized = normalizeIban(iban);
  if (normalized.length < 15 || normalized.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) return false;
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export type EpcQrInput = {
  /** Account holder, at most 70 characters. */
  name: string;
  iban: string;
  amountCents: number;
  /** Free-text reference shown on the statement, at most 140 characters. */
  reference: string;
  bic?: string | undefined;
};

/**
 * Content of an EPC QR code ("GiroCode"): banking apps in the euro area read it and prefill
 * recipient, IBAN, amount and reference. EPC transfers are euro only.
 */
export function buildEpcQrPayload(input: EpcQrInput): string | null {
  if (!isValidIban(input.iban) || input.amountCents <= 0 || input.amountCents > 99_999_999_999) return null;
  const name = input.name
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 70);
  if (!name) return null;
  return [
    'BCD', // service tag
    '002', // version
    '1', // UTF-8
    'SCT', // SEPA credit transfer
    (input.bic ?? '').replace(/\s/g, '').toUpperCase(),
    name,
    normalizeIban(input.iban),
    `EUR${formatAmount(input.amountCents)}`,
    '', // purpose code
    '', // structured reference
    input.reference
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 140),
  ].join('\n');
}
