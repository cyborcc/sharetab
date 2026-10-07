'use client';

import { useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AVATAR_BACKGROUNDS, AVATAR_EMOJIS, encodeEmojiAvatar, parseAvatar } from '@/lib/avatar';

const PHOTO_SIZE = 256;

/** Centre-crops the picture to a square and scales it down to a small JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    PHOTO_SIZE,
    PHOTO_SIZE,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
  );
}

/** Profile picture: a photo from the device, or an emoji on a colour. Everybody has one by default. */
export function AvatarEditor({ userId, name, image }: { userId: string; name: string | null; image: string | null }) {
  const t = useTranslations('settings');
  const { update } = useSession();
  const utils = trpc.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(image);
  const [busy, setBusy] = useState(false);
  const parsed = parseAvatar(current, userId);
  const [colorIndex, setColorIndex] = useState(() => {
    const i = parsed.kind === 'emoji' ? AVATAR_BACKGROUNDS.indexOf(parsed.background) : 0;
    return i < 0 ? 0 : i;
  });

  const updateProfile = trpc.auth.updateProfile.useMutation();

  async function save(next: string | null) {
    setBusy(true);
    try {
      await updateProfile.mutateAsync({ image: next });
      setCurrent(next);
      await update();
      await utils.invalidate();
      toast.success(t('avatar.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('avatar.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', await squareJpeg(file), 'avatar.jpg');
      const res = await fetch('/api/avatar', { method: 'POST', body: form });
      if (!res.ok) throw new Error(t('avatar.failed'));
      const body = (await res.json()) as { image: string };
      setCurrent(body.image);
      await update();
      await utils.invalidate();
      toast.success(t('avatar.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('avatar.failed'));
    } finally {
      setBusy(false);
    }
  }

  const selectedEmoji = parsed.kind === 'emoji' ? parsed.emoji : null;

  return (
    <div className="space-y-3" data-testid="avatar-editor">
      <div className="flex items-center gap-4">
        <UserAvatar image={current} id={userId} name={name} className="h-20 w-20" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Camera className="mr-2 h-4 w-4" />
            {t('avatar.upload')}
          </Button>
          {current && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => save(null)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('avatar.reset')}
            </Button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void upload(file);
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('avatar.emojiHint')}</p>
      <div className="flex flex-wrap gap-1.5">
        {AVATAR_BACKGROUNDS.map((color, i) => (
          <button
            key={color}
            type="button"
            aria-label={`${t('avatar.color')} ${i + 1}`}
            className={`h-6 w-6 rounded-full border-2 ${i === colorIndex ? 'border-foreground' : 'border-transparent'}`}
            style={{ backgroundColor: color }}
            onClick={() => {
              setColorIndex(i);
              if (selectedEmoji) void save(encodeEmojiAvatar(selectedEmoji, i));
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {AVATAR_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={busy}
            className={`flex aspect-square items-center justify-center rounded-lg border text-xl transition-colors hover:bg-muted ${
              emoji === selectedEmoji && current?.startsWith('emoji:') ? 'border-primary bg-primary/10' : ''
            }`}
            onClick={() => void save(encodeEmojiAvatar(emoji, colorIndex))}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
