import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { auth } from '@/server/auth';
import { resolveUploadPath } from '@/server/lib/upload-dir';

/** Profile photo of a user, for any signed-in user (the URL carries ?v=<time> so changes show up). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });

  const { userId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) return new Response('Not found', { status: 404 });

  try {
    const buffer = await readFile(resolveUploadPath(`avatars/${userId}.jpg`));
    return new Response(new Uint8Array(buffer), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
