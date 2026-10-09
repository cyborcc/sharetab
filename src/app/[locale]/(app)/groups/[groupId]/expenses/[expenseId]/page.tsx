'use client';

import { use } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { formatCents } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ArrowLeft, Trash2, Pencil, Check, ChevronDown } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ReceiptHistory } from '@/components/receipts/receipt-history';
import { ExpenseMap } from '@/components/groups/expense-map';
import { memberChipColors } from '@/lib/avatar';

export default function ExpenseDetailPage({ params }: { params: Promise<{ groupId: string; expenseId: string }> }) {
  const { groupId, expenseId } = use(params);
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('expenses');

  const expense = trpc.expenses.get.useQuery({ groupId, expenseId });
  const group = trpc.groups.get.useQuery({ groupId });
  const receiptId = expense.data?.receiptId ?? null;
  const receiptItems = trpc.receipts.getReceiptItems.useQuery({ receiptId: receiptId ?? '' }, { enabled: !!receiptId });
  const history = trpc.receipts.history.useQuery({ receiptId: receiptId ?? '' }, { enabled: !!receiptId });
  const deleteExpense = trpc.expenses.delete.useMutation({
    onSuccess: () => router.push(`/groups/${groupId}`),
  });

  if (expense.isLoading) return <LoadingSpinner />;
  if (!expense.data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Trash2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-lg font-semibold">{t('detail.notFound')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('detail.notFoundDescription')}</p>
        <Button nativeButton={false} render={<Link href={`/groups/${groupId}`} />}>
          {t('detail.backToGroup')}
        </Button>
      </div>
    );
  }

  const e = expense.data;
  if (e.isPrivate && e.title === '') {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="mb-2 text-4xl">🔒</p>
        <h2 className="mb-2 text-lg font-semibold">{t('detail.privateExpense')}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{t('detail.privateExpenseHint')}</p>
        <Button nativeButton={false} render={<Link href={`/groups/${groupId}`} />}>
          {t('detail.backToGroup')}
        </Button>
      </div>
    );
  }
  const groupCurrency = group.data?.currency ?? 'USD';
  const isCurrencyConverted = e.baseCurrencyAmount != null && e.currency.toUpperCase() !== groupCurrency.toUpperCase();
  // Group currency (e.g. EUR) next to the amounts of a foreign-currency expense
  const groupFactor = isCurrencyConverted && e.amount > 0 ? e.baseCurrencyAmount! / e.amount : 1;
  const inGroupCurrency = (cents: number) => formatCents(Math.round(cents * groupFactor), groupCurrency, locale);
  const members = (group.data?.members ?? []).map((m) => {
    const name = m.user.placeholderName ?? m.user.name ?? m.user.email ?? t('detail.unknown');
    return { id: m.user.id, name, image: m.user.image };
  });
  const items = receiptItems.data?.items ?? [];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('detail.backToGroup')}
          nativeButton={false}
          render={<Link href={`/groups/${groupId}`} />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{e.title}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div>
              <span>{formatCents(e.amount, e.currency, locale)}</span>
              {isCurrencyConverted && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({formatCents(e.baseCurrencyAmount!, groupCurrency, locale)})
                </span>
              )}
            </div>
            <Badge variant="secondary">{e.splitMode}</Badge>
          </CardTitle>
          {isCurrencyConverted && (
            <p className="text-xs text-muted-foreground">
              {t('detail.exchangeRate', {
                rate: e.exchangeRate?.toFixed(4) ?? '1.0000',
                from: e.currency,
                to: groupCurrency,
              })}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">{t('detail.paidBy')}</p>
              <p className="font-medium">{e.paidBy.name ?? t('detail.unknown')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('detail.date')}</p>
              <p className="font-medium">{new Date(e.expenseDate).toLocaleDateString()}</p>
            </div>
            {e.category && (
              <div>
                <p className="text-muted-foreground">{t('detail.category')}</p>
                <p className="font-medium">{e.category}</p>
              </div>
            )}
            {e.placeName && (
              <div className="col-span-2">
                <p className="text-muted-foreground">{t('detail.location')}</p>
                {e.latitude != null && e.longitude != null ? (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=16/${e.latitude}/${e.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {e.placeName}
                  </a>
                ) : (
                  <p className="font-medium">{e.placeName}</p>
                )}
                {e.latitude != null && e.longitude != null && (
                  <div className="mt-2 space-y-1" data-testid="expense-place-map">
                    <ExpenseMap
                      heightClass="h-40"
                      errorText={t('detail.mapFailed')}
                      points={[
                        {
                          id: e.id,
                          title: e.placeName,
                          amount: formatCents(e.amount, e.currency, locale),
                          lat: e.latitude,
                          lon: e.longitude,
                        },
                      ]}
                    />
                    <div className="flex gap-3 text-xs">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=17/${e.latitude}/${e.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        OpenStreetMap
                      </a>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${e.latitude},${e.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Google Maps
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <p className="text-muted-foreground">{t('detail.addedBy')}</p>
              <p className="font-medium">{e.addedBy.name ?? t('detail.unknown')}</p>
            </div>
          </div>

          {e.description && (
            <>
              <Separator />
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t('detail.notes')}</p>
                <p className="whitespace-pre-wrap text-sm">{e.description}</p>
              </div>
            </>
          )}

          {(items.length > 0 || e.receipt?.imagePath) && (
            <>
              <Separator />
              {/* The items are the focus and always visible, laid out as in the editor; only the photo is folded away. */}
              <div className="space-y-2" data-testid="expense-items">
                {e.receipt?.imagePath && (
                  <details className="rounded-md border" data-testid="expense-receipt-image">
                    <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-sm font-medium">
                      <span>{t('detail.receiptImage')}</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </summary>
                    <div className="px-3 pb-3">
                      <a href={`/api/uploads/${e.receipt.imagePath}`} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/uploads/${e.receipt.imagePath}`}
                          alt={t('detail.receiptImage')}
                          loading="lazy"
                          className="max-h-96 w-auto rounded-md border object-contain"
                        />
                      </a>
                    </div>
                  </details>
                )}
                {items.length > 0 && (
                  <p className="text-sm font-medium">{t('detail.items', { count: items.length })}</p>
                )}
                {items.map((item) => {
                  const assigned = new Map(item.assignments.map((a) => [a.userId, a.shareOfItem]));
                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border px-3 py-3 ${assigned.size === 0 ? 'border-amber-300' : ''}`}
                      data-testid={`item-card-${item.id}`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="break-words font-medium">{item.name}</span>
                          {item.quantity > 1 && (
                            <span className="shrink-0 text-xs text-muted-foreground">x{item.quantity}</span>
                          )}
                        </div>
                        <span className="shrink-0 text-right font-semibold tabular-nums">
                          {formatCents(item.totalPrice, e.currency, locale)}
                          {isCurrencyConverted && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              ≈ {inGroupCurrency(item.totalPrice)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {members.map((m) => {
                          const units = assigned.get(m.id);
                          const isAssigned = units !== undefined;
                          return (
                            <span
                              key={m.id}
                              data-testid={`member-chip-${m.id}`}
                              data-assigned={isAssigned}
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                                isAssigned ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              <Avatar className="h-4 w-4">
                                <AvatarFallback className="text-[8px]">{m.initials}</AvatarFallback>
                              </Avatar>
                              {m.name.split(' ')[0]}
                              {isAssigned &&
                                (units > 1 ? (
                                  <span className="font-semibold">×{units}</span>
                                ) : (
                                  <Check className="h-3 w-3" />
                                ))}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {items.length > 0 && <p className="text-xs text-muted-foreground">{t('detail.itemsHint')}</p>}
              </div>
            </>
          )}

          <Separator />

          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t('detail.split')}</p>
            <div className="space-y-1">
              {e.shares.map((share) => (
                <div key={share.userId} className="flex items-center justify-between text-sm">
                  <span>{share.user.name ?? t('detail.unknown')}</span>
                  <span className="text-right font-medium">
                    {formatCents(share.amount, e.currency, locale)}
                    {isCurrencyConverted && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ≈ {inGroupCurrency(share.amount)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {e.receiptId && history.data && (
        <ReceiptHistory
          entries={history.data}
          members={(group.data?.members ?? []).map((m) => ({
            id: m.user.id,
            name: m.user.placeholderName ?? m.user.name ?? m.user.email,
          }))}
          currency={e.currency}
          existingItemIds={new Set((receiptItems.data?.items ?? []).map((i) => i.id))}
          onShowItem={(itemId) =>
            router.push(`/groups/${groupId}/scan?receiptId=${e.receiptId}&expenseId=${expenseId}#item-${itemId}`)
          }
        />
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          nativeButton={false}
          render={<Link href={`/groups/${groupId}/expenses/${expenseId}/edit`} />}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {t('detail.edit')}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => {
            if (confirm(t('detail.deleteConfirm'))) {
              deleteExpense.mutate({ groupId, expenseId });
            }
          }}
          disabled={deleteExpense.isPending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {deleteExpense.isPending ? t('detail.deleting') : t('detail.delete')}
        </Button>
      </div>
    </div>
  );
}
