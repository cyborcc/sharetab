import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { logger } from '@/server/lib/logger';
import { resolveUploadPath } from '@/server/lib/upload-dir';
import { checkRateLimit } from '@/server/lib/rate-limit';

// The profile page scales the photo to a small square JPEG before sending it, so a few hundred KB is plenty.
const MAX_BYTES = 512 * 1024;

function isJpeg(buffer: Buffer): boolean {
  return buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/** Stores the signed-in user's profile photo and points User.image at it. */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = checkRateLimit(`avatar:${userId}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 413 });

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isJpeg(buffer)) return NextResponse.json({ error: 'Only JPEG images are accepted' }, { status: 415 });

  const path = resolveUploadPath(`avatars/${userId}.jpg`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);

  const image = `/api/avatar/${userId}?v=${Date.now()}`;
  await db.user.update({ where: { id: userId }, data: { image } });
  logger.info('avatar.uploaded', { userId, bytes: buffer.length });
  return NextResponse.json({ image });
}
