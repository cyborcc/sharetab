'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bug, Check, ExternalLink, Lightbulb, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { UserAvatar } from '@/components/ui/user-avatar';
import { buildIssueUrl } from '@/lib/github-issue';

type Kind = 'BUG' | 'IDEA';
type Status = 'OPEN' | 'APPROVED' | 'DONE' | 'REJECTED';

const STATUS_STYLE: Record<Status, string> = {
  OPEN: 'bg-muted text-muted-foreground',
  APPROVED: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  DONE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  REJECTED: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

/** Report a problem or suggest an improvement; the admin confirms entries before they are built. */
export default function FeedbackPage() {
  const t = useTranslations('feedback');
  const locale = useLocale();
  const utils = trpc.useUtils();
  const list = trpc.feedback.list.useQuery();
  const isAdmin = trpc.feedback.isAdmin.useQuery();
  const [kind, setKind] = useState<Kind>('IDEA');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const create = trpc.feedback.create.useMutation({
    onSuccess: async () => {
      setTitle('');
      setBody('');
      toast.success(t('sent'));
      await utils.feedback.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const setStatus = trpc.feedback.setStatus.useMutation({
    onSuccess: () => utils.feedback.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });
  const remove = trpc.feedback.remove.useMutation({
    onSuccess: () => utils.feedback.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const admin = isAdmin.data?.admin === true;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('intro')}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('new')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ kind, title, body });
            }}
          >
            <div className="inline-flex rounded-lg border p-0.5 text-sm">
              {(['IDEA', 'BUG'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${
                    kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {k === 'IDEA' ? <Lightbulb className="h-3.5 w-3.5" /> : <Bug className="h-3.5 w-3.5" />}
                  {t(`kind.${k}`)}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-title">{t('titleLabel')}</Label>
              <Input
                id="fb-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-body">{t('bodyLabel')}</Label>
              <textarea
                id="fb-body"
                value={body}
                maxLength={4000}
                rows={4}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('bodyPlaceholder')}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" disabled={create.isPending || title.trim().length < 3} data-testid="feedback-send">
              <Send className="mr-2 h-4 w-4" />
              {t('send')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <LoadingSpinner />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-3">
          {(list.data ?? []).map((f) => (
            <Card key={f.id} data-testid="feedback-entry">
              <CardContent className="space-y-2 py-4">
                <div className="flex items-start gap-3">
                  <UserAvatar
                    image={f.user?.image}
                    id={f.user?.id ?? 'deleted'}
                    name={f.user?.name}
                    className="h-8 w-8"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {f.kind === 'BUG' ? (
                        <Bug className="h-4 w-4 text-red-500" />
                      ) : (
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                      )}
                      <span className="break-words">{f.title}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {f.user?.name ?? '?'} · {new Date(f.createdAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[f.status]}`}>
                    {t(`status.${f.status}`)}
                  </span>
                </div>
                {f.body && <p className="whitespace-pre-wrap break-words text-sm">{f.body}</p>}
                {f.adminNote && <p className="rounded-md bg-muted p-2 text-xs">{f.adminNote}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {admin && f.status !== 'APPROVED' && f.status !== 'DONE' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: f.id, status: 'APPROVED' })}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {t('approve')}
                    </Button>
                  )}
                  {admin && f.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: f.id, status: 'DONE' })}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {t('markDone')}
                    </Button>
                  )}
                  {admin && f.status !== 'REJECTED' && f.status !== 'DONE' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: f.id, status: 'REJECTED' })}
                    >
                      <X className="mr-1.5 h-4 w-4" />
                      {t('reject')}
                    </Button>
                  )}
                  {(f.mine || admin) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      nativeButton={false}
                      render={
                        <a
                          href={buildIssueUrl({ kind: f.kind, title: f.title, body: f.body })}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="feedback-github"
                        />
                      }
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      {t('reportOnGithub')}
                    </Button>
                  )}
                  {f.mine && f.status === 'OPEN' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(t('removeConfirm'))) remove.mutate({ id: f.id });
                      }}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      {t('remove')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
