import { describe, expect, test } from 'vitest';
import { detectPushSupport, type PushEnvironment } from './push-support';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const base: PushEnvironment = {
  userAgent: DESKTOP_UA,
  platform: 'Linux x86_64',
  maxTouchPoints: 0,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
};

describe('detectPushSupport', () => {
  test('a desktop browser with everything is supported', () => {
    expect(detectPushSupport(base)).toMatchObject({ supported: true, ios: false, hint: 'none' });
  });

  test('an iPhone in a Safari tab has no PushManager and needs the home screen', () => {
    const result = detectPushSupport({ ...base, userAgent: IPHONE_UA, platform: 'iPhone', hasPushManager: false });
    expect(result).toMatchObject({ supported: false, ios: true, hint: 'ios-install' });
  });

  test('an iPhone app from the home screen with push is supported', () => {
    const result = detectPushSupport({ ...base, userAgent: IPHONE_UA, platform: 'iPhone', standalone: true });
    expect(result).toMatchObject({ supported: true, ios: true, standalone: true, hint: 'none' });
  });

  test('a home screen app without push means iOS is too old', () => {
    const result = detectPushSupport({
      ...base,
      userAgent: IPHONE_UA,
      platform: 'iPhone',
      standalone: true,
      hasPushManager: false,
    });
    expect(result.hint).toBe('ios-update');
  });

  test('an iPad that reports itself as a Mac is recognised by its touch screen', () => {
    const ipad = { ...base, platform: 'MacIntel', maxTouchPoints: 5, hasPushManager: false };
    expect(detectPushSupport(ipad)).toMatchObject({ ios: true, hint: 'ios-install' });
    expect(detectPushSupport({ ...ipad, maxTouchPoints: 0 })).toMatchObject({ ios: false, hint: 'unsupported' });
  });

  test('another browser without push gets the generic hint', () => {
    expect(detectPushSupport({ ...base, hasNotification: false }).hint).toBe('unsupported');
  });
});
