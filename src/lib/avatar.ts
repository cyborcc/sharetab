const avatarColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-lime-500',
];

export function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  // Modulo always lands in bounds; fallback is unreachable but keeps the
  // return type `string` instead of `string | undefined`.
  return avatarColors[Math.abs(hash) % avatarColors.length] ?? 'bg-blue-500';
}

const guestColors = [
  'bg-red-100 text-red-700',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
];

export function guestAvatarColor(index: number): string {
  // Modulo always lands in bounds; fallback is unreachable but keeps the
  // return type `string` instead of `string | undefined`.
  return guestColors[Math.abs(Math.floor(index)) % guestColors.length] ?? 'bg-red-100 text-red-700';
}

export function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return (
      name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'
    );
  }
  return email?.[0]?.toUpperCase() ?? '?';
}

// ─── Profile avatars ───────────────────────────────────────
// User.image holds either a photo URL (own upload or an SSO picture) or "emoji:<emoji>:<colour index>".
// Without one, everybody still gets an avatar: an emoji and colour derived from the user id.

export const AVATAR_EMOJIS = [
  '🦊',
  '🐼',
  '🦁',
  '🐯',
  '🐸',
  '🐙',
  '🦄',
  '🐧',
  '🦉',
  '🐢',
  '🦈',
  '🐬',
  '🦋',
  '🐝',
  '🦖',
  '🐨',
  '🐵',
  '🦩',
  '🐳',
  '🦜',
  '🐺',
  '🐰',
  '🦔',
  '🐞',
];

export const AVATAR_BACKGROUNDS = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#f43f5e',
  '#06b6d4',
  '#d946ef',
  '#84cc16',
];

export type ParsedAvatar = { kind: 'photo'; src: string } | { kind: 'emoji'; emoji: string; background: string };

export function encodeEmojiAvatar(emoji: string, colorIndex: number): string {
  return `emoji:${emoji}:${Math.abs(Math.floor(colorIndex)) % AVATAR_BACKGROUNDS.length}`;
}

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function parseAvatar(image: string | null | undefined, id: string): ParsedAvatar {
  if (image?.startsWith('emoji:')) {
    const [, emoji, color] = image.split(':');
    if (emoji) {
      const index = Number(color);
      return {
        kind: 'emoji',
        emoji,
        background: AVATAR_BACKGROUNDS[Number.isInteger(index) ? index % AVATAR_BACKGROUNDS.length : 0] ?? '#3b82f6',
      };
    }
  }
  if (image && (image.startsWith('/') || image.startsWith('http'))) return { kind: 'photo', src: image };
  const hash = hashId(id);
  return {
    kind: 'emoji',
    emoji: AVATAR_EMOJIS[hash % AVATAR_EMOJIS.length] ?? '🦊',
    background: AVATAR_BACKGROUNDS[Math.floor(hash / AVATAR_EMOJIS.length) % AVATAR_BACKGROUNDS.length] ?? '#3b82f6',
  };
}

/** Black or white, whichever reads better on the given #rrggbb background. */
function readableTextOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#111827' : '#ffffff';
}

/**
 * Colours of a person's chip (e.g. on a receipt item): the colour of their avatar, so a chip matches the avatar
 * shown everywhere else. Someone with a photo gets the colour derived from their id.
 */
export function memberChipColors(
  image: string | null | undefined,
  id: string,
): { background: string; color: string } {
  const picked = parseAvatar(image, id);
  const avatar = picked.kind === 'emoji' ? picked : parseAvatar(null, id);
  const background = avatar.kind === 'emoji' ? avatar.background : '#3b82f6';
  return { background, color: readableTextOn(background) };
}
