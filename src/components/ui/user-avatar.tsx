'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials, parseAvatar } from '@/lib/avatar';
import { cn } from '@/lib/utils';

/**
 * A user's round avatar: their photo, the emoji they picked, or an emoji derived from their id.
 * Size comes from `className` (e.g. "h-6 w-6"); the emoji scales with the box (container query units).
 */
export function UserAvatar({
  image,
  id,
  name,
  email,
  className,
  title,
}: {
  image?: string | null | undefined;
  id: string;
  name?: string | null | undefined;
  email?: string | null | undefined;
  className?: string;
  title?: string;
}) {
  const avatar = parseAvatar(image, id);
  if (avatar.kind === 'photo') {
    return (
      <Avatar className={cn('shrink-0', className)} {...(title ? { title } : {})}>
        <AvatarImage src={avatar.src} />
        <AvatarFallback className="text-[10px]">{getInitials(name, email)}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <span
      {...(title ? { title } : {})}
      aria-hidden={title ? undefined : true}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full leading-none',
        className,
      )}
      style={{ backgroundColor: avatar.background, containerType: 'inline-size' }}
    >
      <span style={{ fontSize: '58cqw' }} className="leading-none">
        {avatar.emoji}
      </span>
    </span>
  );
}
