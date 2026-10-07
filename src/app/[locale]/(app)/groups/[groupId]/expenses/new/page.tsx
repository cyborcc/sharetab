'use client';

import { use, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { trpc } from '@/lib/trpc';
import { parseToCents, formatCents } from '@/lib/money';
import { COMMON_CURRENCIES } from '@/lib/currencies';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useSession } from 'next-auth/react';
import { PrivateToggle } from '@/components/expenses/private-toggle';
import { CategorySelect } from '@/components/expenses/category-select';
import { LocationField, type PlaceValue } from '@/components/expenses/location-field';
import { EqualSplit } from '@/components/expenses/equal-split';
import { ExactSplit } from '@/components/expenses/exact-split';
import { PercentageSplit } from '@/components/expenses/percentage-split';
import { SharesSplit } from '@/components/expenses/shares-split';

type SplitMode = 'EQUAL' | 'EXACT' | 'PERCENTAGE' | 'SHARES';

type MemberInfo = {
  id: string;
  name: string | null;
};

type ShareEntry = {
  userId: string;
  amount: number;
  shares?: number;
  percentage?: number;
};

export default function NewExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('expenses');
  const group = trpc.groups.get.useQuery({ groupId });

  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const { data: authSession } = useSession();
  const [notes, setNotes] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [category, setCategory] = useState('');
  const [place, setPlace] = useState<PlaceValue>({ placeName: '', latitude: null, longitude: null });
  const [expenseDate, setExpenseDate] = useState(() => new Date().toLocaleDateString('sv-SE'));
  const [paidById, setPaidById] = useState('');
  // The logged-in member pays by default; anyone else can still be picked.
  const myId = authSession?.user?.id;
  const iAmMember = !!myId && !!group.data?.members.some((m) => m.user.id === myId);
  if (!paidById && iAmMember && myId) setPaidById(myId);
  const [splitMode, setSplitMode] = useState<SplitMode>('EQUAL');
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [currency, setCurrency] = useState<string>('');
  const [manualRate, setManualRate] = useState<string>('');
  const [useManualRate, setUseManualRate] = useState(false);

  // Initialize currency from group when data loads
  const groupCurrency = group.data?.currency ?? 'USD';
  const effectiveCurrency = currency || groupCurrency;
  const isDifferentCurrency = effectiveCurrency.toUpperCase() !== groupCurrency.toUpperCase();

  const splitModes = useMemo(
    () => [
      { value: 'EQUAL' as SplitMode, label: t('new.splitEqual'), description: t('new.splitEqualDescription') },
      { value: 'EXACT' as SplitMode, label: t('new.splitExact'), description: t('new.splitExactDescription') },
      {
        value: 'PERCENTAGE' as SplitMode,
        label: t('new.splitPercentage'),
        description: t('new.splitPercentageDescription'),
      },
      { value: 'SHARES' as SplitMode, label: t('new.splitShares'), description: t('new.splitSharesDescription') },
    ],
    [t],
  );

  const createExpense = trpc.expenses.create.useMutation({
    onSuccess: () => {
      router.push(`/groups/${groupId}`);
    },
  });

  const members: MemberInfo[] = useMemo(
    () =>
      group.data?.members.map((m) => ({
        id: m.user.id,
        name: m.user.name ?? m.user.email,
      })) ?? [],
    [group.data?.members],
  );

  const amountCents = parseToCents(amountStr);
  const parsedManualRate = parseFloat(manualRate);
  const manualRateValid = useManualRate && !isNaN(parsedManualRate) && parsedManualRate > 0;

  // Private only when the signed-in payer is the sole sharer of the expense
  const privateEligible =
    !!authSession?.user?.id &&
    paidById === authSession.user.id &&
    shares.length === 1 &&
    shares[0]?.userId === paidById;
  const isPrivateEffective = isPrivate && privateEligible;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paidById || amountCents <= 0 || shares.length === 0) return;

    createExpense.mutate({
      groupId,
      title,
      ...(notes.trim() ? { description: notes.trim() } : {}),
      amount: amountCents,
      currency: effectiveCurrency,
      ...(isDifferentCurrency && manualRateValid ? { exchangeRate: parsedManualRate } : {}),
      category: category.trim() || undefined,
      ...(place.placeName.trim() ? { placeName: place.placeName.trim() } : {}),
      ...(place.latitude !== null && place.longitude !== null
        ? { latitude: place.latitude, longitude: place.longitude }
        : {}),
      ...(isPrivateEffective ? { isPrivate: true } : {}),
      ...(expenseDate ? { expenseDate: new Date(`${expenseDate}T12:00:00`).toISOString() } : {}),
      paidById,
      splitMode,
      shares,
    });
  }

  if (group.isLoading) return <LoadingSpinner />;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('new.backToGroup')}
          nativeButton={false}
          render={<Link href={`/groups/${groupId}`} />}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{t('new.title')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('new.expenseDetails')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t('new.description')}</Label>
              <Input
                id="title"
                placeholder={t('new.descriptionPlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div className="space-y-2">
                <Label htmlFor="amount">{t('new.amount')}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder={t('new.amountPlaceholder')}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t('new.currency')}</Label>
                <select
                  id="currency"
                  value={effectiveCurrency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isDifferentCurrency && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/50">
                <p className="text-blue-800 dark:text-blue-200">
                  {t('new.differentCurrencyNote', {
                    expenseCurrency: effectiveCurrency,
                    groupCurrency,
                  })}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300">
                    <input
                      type="checkbox"
                      checked={useManualRate}
                      onChange={(e) => setUseManualRate(e.target.checked)}
                      className="rounded"
                    />
                    {t('new.manualRateOverride')}
                  </label>
                </div>
                {useManualRate && (
                  <div className="mt-2">
                    <Input
                      type="number"
                      step="any"
                      min="0.000001"
                      placeholder={t('new.exchangeRatePlaceholder', {
                        from: effectiveCurrency,
                        to: groupCurrency,
                      })}
                      value={manualRate}
                      onChange={(e) => setManualRate(e.target.value)}
                    />
                    {manualRateValid && amountCents > 0 && (
                      <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                        {t('new.convertedAmount', {
                          amount: formatCents(Math.round(amountCents * parsedManualRate), groupCurrency, locale),
                        })}
                      </p>
                    )}
                  </div>
                )}
                {!useManualRate && (
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">{t('new.autoRateNote')}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="category">{t('new.category')}</Label>
              <CategorySelect value={category} onChange={setCategory} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expenseDate">{t('new.date')}</Label>
              <Input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">{t('new.location')}</Label>
              <LocationField value={place} onChange={setPlace} category={category} groupId={groupId} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('new.notes')}</Label>
              <textarea
                id="notes"
                rows={3}
                maxLength={1000}
                placeholder={t('new.notesPlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <PrivateToggle checked={isPrivateEffective} eligible={privateEligible} onChange={setIsPrivate} />

            <div className="space-y-2">
              <Label htmlFor="paidBy">{t('new.paidBy')}</Label>
              <select
                id="paidBy"
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{t('new.selectMember')}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? t('new.unnamed')}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>{t('new.splitType')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {splitModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setSplitMode(mode.value)}
                    className={`rounded-md border p-2 text-left text-sm transition-colors ${
                      splitMode === mode.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <div className="font-medium">{mode.label}</div>
                    <div className="text-xs text-muted-foreground">{mode.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('new.splitBetween')}</Label>
              {splitMode === 'EQUAL' && (
                <EqualSplit
                  members={members}
                  totalCents={amountCents}
                  onChange={setShares}
                  locale={locale}
                  currency={effectiveCurrency}
                />
              )}
              {splitMode === 'EXACT' && (
                <ExactSplit
                  members={members}
                  totalCents={amountCents}
                  onChange={setShares}
                  locale={locale}
                  currency={effectiveCurrency}
                />
              )}
              {splitMode === 'PERCENTAGE' && (
                <PercentageSplit
                  members={members}
                  totalCents={amountCents}
                  onChange={setShares}
                  locale={locale}
                  currency={effectiveCurrency}
                />
              )}
              {splitMode === 'SHARES' && (
                <SharesSplit
                  members={members}
                  totalCents={amountCents}
                  onChange={setShares}
                  locale={locale}
                  currency={effectiveCurrency}
                />
              )}
            </div>

            {createExpense.error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {createExpense.error.message}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={createExpense.isPending || amountCents <= 0 || shares.length === 0}
            >
              {createExpense.isPending ? t('new.submitting') : t('new.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
