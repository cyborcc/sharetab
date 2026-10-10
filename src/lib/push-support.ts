export type PushSupport = {
  /** The browser can show push messages right now. */
  supported: boolean;
  /** An iPhone, iPad or iPod (including iPadOS, which reports itself as a Mac). */
  ios: boolean;
  /** Opened from the home screen icon instead of a browser tab. */
  standalone: boolean;
  /** What to tell the person when push is not possible. */
  hint: 'none' | 'ios-install' | 'ios-update' | 'unsupported';
};

export type PushEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
};

/**
 * iOS only offers web push to apps added to the home screen (iOS 16.4 or newer), so a Safari tab
 * has no PushManager at all. Telling the cases apart lets the page say exactly what is missing.
 */
export function detectPushSupport(env: PushEnvironment): PushSupport {
  const ios = /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
  const supported = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (supported) return { supported, ios, standalone: env.standalone, hint: 'none' };
  if (ios) return { supported, ios, standalone: env.standalone, hint: env.standalone ? 'ios-update' : 'ios-install' };
  return { supported, ios, standalone: env.standalone, hint: 'unsupported' };
}

/** Reads the current browser; client only. */
export function readPushEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
  };
}
