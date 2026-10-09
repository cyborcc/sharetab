import { describe, it, expect } from 'vitest';
import {
  avatarColor,
  guestAvatarColor,
  getInitials,
  parseAvatar,
  encodeEmojiAvatar,
  AVATAR_BACKGROUNDS,
  memberChipColors,
} from './avatar';

describe('avatarColor', () => {
  it('returns a Tailwind bg class', () => {
    expect(avatarColor('user-123')).toMatch(/^bg-\w+-500$/);
  });

  it('returns the same color for the same userId', () => {
    expect(avatarColor('abc')).toBe(avatarColor('abc'));
  });

  it('returns different colors for different userIds', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('guestAvatarColor', () => {
  it('returns a guest color class', () => {
    expect(guestAvatarColor(0)).toContain('bg-');
    expect(guestAvatarColor(0)).toContain('text-');
  });

  it('wraps around at palette length', () => {
    expect(guestAvatarColor(0)).toBe(guestAvatarColor(8));
  });

  it('handles negative index', () => {
    expect(guestAvatarColor(-1)).toMatch(/^bg-/);
  });

  it('handles non-integer index', () => {
    expect(guestAvatarColor(1.7)).toMatch(/^bg-/);
  });
});

describe('getInitials', () => {
  it('returns first letters of name parts', () => {
    expect(getInitials('Alice Johnson')).toBe('AJ');
  });

  it('limits to 2 characters', () => {
    expect(getInitials('Alice Bob Charlie')).toBe('AB');
  });

  it('falls back to email initial', () => {
    expect(getInitials(null, 'alice@test.com')).toBe('A');
  });

  it('returns ? when no name or email', () => {
    expect(getInitials(null, null)).toBe('?');
  });

  it('handles single name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('uppercases', () => {
    expect(getInitials('alice johnson')).toBe('AJ');
  });
});

describe('parseAvatar', () => {
  it('reads a chosen emoji avatar', () => {
    expect(parseAvatar(encodeEmojiAvatar('🦊', 2), 'u1')).toEqual({
      kind: 'emoji',
      emoji: '🦊',
      background: AVATAR_BACKGROUNDS[2],
    });
  });

  it('uses photo URLs as they are', () => {
    expect(parseAvatar('/api/avatar/u1?v=1', 'u1')).toEqual({ kind: 'photo', src: '/api/avatar/u1?v=1' });
  });

  it('gives everybody without an image a stable emoji avatar', () => {
    const a = parseAvatar(null, 'user-a');
    expect(a.kind).toBe('emoji');
    expect(parseAvatar(null, 'user-a')).toEqual(a);
  });
});

describe('memberChipColors', () => {
  it('uses the colour of the avatar the user picked', () => {
    expect(memberChipColors(encodeEmojiAvatar('🦊', 4), 'u1').background).toBe(AVATAR_BACKGROUNDS[4]);
  });

  it('is the same colour the generated avatar of a user without a picture gets', () => {
    const generated = parseAvatar(null, 'user-42');
    expect(generated.kind).toBe('emoji');
    expect(memberChipColors(null, 'user-42').background).toBe((generated as { background: string }).background);
  });

  it('falls back to the colour derived from the id for a photo', () => {
    expect(memberChipColors('https://example.com/me.png', 'user-42')).toEqual(memberChipColors(null, 'user-42'));
  });

  it('picks dark text on light colours and white text on dark ones', () => {
    expect(memberChipColors(encodeEmojiAvatar('🦊', 7), 'u').color).toBe('#111827'); // lime
    expect(memberChipColors(encodeEmojiAvatar('🦊', 2), 'u').color).toBe('#ffffff'); // violet
  });
});
