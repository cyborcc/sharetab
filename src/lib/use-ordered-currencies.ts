'use client';

import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { orderCurrencies } from '@/lib/currencies';

/** Currency list for a group's selectors: group currency, then the trip country's currency, then the rest. */
export function useOrderedCurrencies(groupId: string, groupCurrency: string | undefined) {
  const recent = trpc.groups.recentCurrencies.useQuery({ groupId }, { staleTime: 60_000 });
  return useMemo(() => orderCurrencies(groupCurrency, recent.data ?? []), [groupCurrency, recent.data]);
}
