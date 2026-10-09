import { describe, expect, test } from 'vitest';
import {
  buildEpcQrPayload,
  buildPaypalEmailUrl,
  buildPaypalMeUrl,
  formatIban,
  isValidIban,
  isValidPaypalEmail,
  isValidPaypalMeName,
  normalizeIban,
  normalizePaypalMeName,
} from './payments';

describe('PayPal.me', () => {
  test('reduces links and handles to the bare name', () => {
    expect(normalizePaypalMeName('cyborcc')).toBe('cyborcc');
    expect(normalizePaypalMeName('@cyborcc')).toBe('cyborcc');
    expect(normalizePaypalMeName(' paypal.me/cyborcc ')).toBe('cyborcc');
    expect(normalizePaypalMeName('https://www.paypal.me/cyborcc/12.50EUR')).toBe('cyborcc');
    expect(normalizePaypalMeName('https://paypal.com/paypalme/cyborcc?x=1')).toBe('cyborcc');
    expect(normalizePaypalMeName('   ')).toBe('');
  });

  test('validates names', () => {
    expect(isValidPaypalMeName('cyborcc')).toBe(true);
    expect(isValidPaypalMeName('paypal.me/cyborcc')).toBe(true);
    expect(isValidPaypalMeName('')).toBe(false);
    expect(isValidPaypalMeName('two words')).toBe(false);
    expect(isValidPaypalMeName('a'.repeat(31))).toBe(false);
  });

  test('builds a link with amount and currency', () => {
    expect(buildPaypalMeUrl('cyborcc', 1250, 'EUR')).toBe('https://www.paypal.me/cyborcc/12.50EUR');
    expect(buildPaypalMeUrl('https://paypal.me/cyborcc', 5, 'USD')).toBe('https://www.paypal.me/cyborcc/0.05USD');
  });

  test('refuses bad input', () => {
    expect(buildPaypalMeUrl('', 1250, 'EUR')).toBeNull();
    expect(buildPaypalMeUrl('cyborcc', 0, 'EUR')).toBeNull();
    expect(buildPaypalMeUrl('cyborcc', 1250, 'euro')).toBeNull();
  });
});

describe('PayPal by e-mail', () => {
  test('validates addresses', () => {
    expect(isValidPaypalEmail('a@b.de')).toBe(true);
    expect(isValidPaypalEmail(' a@b.de ')).toBe(true);
    expect(isValidPaypalEmail('a@b')).toBe(false);
    expect(isValidPaypalEmail('a b@c.de')).toBe(false);
    expect(isValidPaypalEmail('')).toBe(false);
  });

  test('puts recipient, amount, currency and reference into the link', () => {
    const url = buildPaypalEmailUrl('anna@example.com', 1999, 'EUR', 'Splitbon: Japan & friends');
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe('https://www.paypal.com/cgi-bin/webscr');
    expect(parsed.searchParams.get('business')).toBe('anna@example.com');
    expect(parsed.searchParams.get('amount')).toBe('19.99');
    expect(parsed.searchParams.get('currency_code')).toBe('EUR');
    expect(parsed.searchParams.get('item_name')).toBe('Splitbon: Japan & friends');
  });

  test('refuses bad input', () => {
    expect(buildPaypalEmailUrl('nope', 1999, 'EUR', 'x')).toBeNull();
    expect(buildPaypalEmailUrl('anna@example.com', -1, 'EUR', 'x')).toBeNull();
    expect(buildPaypalEmailUrl('anna@example.com', 1999, 'eur', 'x')).toBeNull();
  });
});

describe('IBAN', () => {
  test('normalizes and formats', () => {
    expect(normalizeIban('de89 3704-0044 0532 0130 00')).toBe('DE89370400440532013000');
    expect(formatIban('DE89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
  });

  test('accepts well-known valid IBANs', () => {
    expect(isValidIban('DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isValidIban('FR14 2004 1010 0505 0001 3M02 606')).toBe(true);
  });

  test('rejects wrong check digits, bad characters and bad lengths', () => {
    expect(isValidIban('DE88 3704 0044 0532 0130 00')).toBe(false);
    expect(isValidIban('DE89 3704 0044 0532 0130 01')).toBe(false);
    expect(isValidIban('1234')).toBe(false);
    expect(isValidIban('')).toBe(false);
    expect(isValidIban('DE89 3704 0044 0532 0130 0!')).toBe(false);
  });
});

describe('EPC QR payload', () => {
  const base = {
    name: 'Anna Beispiel',
    iban: 'DE89 3704 0044 0532 0130 00',
    amountCents: 1250,
    reference: 'Splitbon: Japan',
  };

  test('follows the EPC069-12 line layout', () => {
    const lines = buildEpcQrPayload(base)!.split('\n');
    expect(lines).toEqual([
      'BCD',
      '002',
      '1',
      'SCT',
      '',
      'Anna Beispiel',
      'DE89370400440532013000',
      'EUR12.50',
      '',
      '',
      'Splitbon: Japan',
    ]);
  });

  test('includes the BIC when given and trims long text', () => {
    const payload = buildEpcQrPayload({
      ...base,
      bic: 'cobadeff xxx',
      name: 'N'.repeat(100),
      reference: 'r'.repeat(200),
    })!;
    const lines = payload.split('\n');
    expect(lines[4]).toBe('COBADEFFXXX');
    expect(lines[5]).toHaveLength(70);
    expect(lines[10]).toHaveLength(140);
  });

  test('flattens line breaks in free text', () => {
    const lines = buildEpcQrPayload({ ...base, reference: 'a\nb' })!.split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[10]).toBe('a b');
  });

  test('refuses an invalid IBAN, a missing name or a non-positive amount', () => {
    expect(buildEpcQrPayload({ ...base, iban: 'DE00' })).toBeNull();
    expect(buildEpcQrPayload({ ...base, name: '  ' })).toBeNull();
    expect(buildEpcQrPayload({ ...base, amountCents: 0 })).toBeNull();
  });
});
