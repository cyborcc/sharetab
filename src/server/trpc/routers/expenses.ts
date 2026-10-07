import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, groupMemberProcedure } from '../init';
import { SplitMode, type Prisma } from '@/generated/prisma/client';
import { getExchangeRate, convertCents } from '../../lib/exchange-rates';
import { MAX_MONEY_CENTS } from '@/lib/money';
import { stripUndefined } from '../../lib/strip-undefined';

const expenseShareSchema = z.object({
  userId: z.string(),
  amount: z.number().int().nonnegative().max(MAX_MONEY_CENTS),
  shares: z.number().int().optional(),
  percentage: z.number().int().optional(),
});

const expenseSharesArraySchema = z
  .array(expenseShareSchema)
  .min(1)
  .refine((shares) => new Set(shares.map((s) => s.userId)).size === shares.length, {
    message: 'Duplicate user in shares',
  });

const exchangeRateSchema = z.number().positive().finite().max(1_000_000);

type PrivacyFields = {
  isPrivate: boolean;
  paidById: string;
  title: string;
  description: string | null;
  amount: number;
  baseCurrencyAmount: number | null;
  category: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** Hide title, amount and details of a private expense from everyone but its payer. */
function maskPrivate<T extends PrivacyFields>(expense: T, viewerId: string): T {
  if (!expense.isPrivate || expense.paidById === viewerId) return expense;
  return {
    ...expense,
    title: '',
    description: null,
    amount: 0,
    baseCurrencyAmount: expense.baseCurrencyAmount === null ? null : 0,
    category: null,
    placeName: null,
    latitude: null,
    longitude: null,
    shares: [],
    receipt: null,
    receiptId: null,
  };
}

/** A private expense is only allowed when nobody else shares it: one share, owned by the payer. */
function assertPrivateAllowed(paidById: string, shareUserIds: string[], viewerId: string) {
  if (paidById !== viewerId || shareUserIds.length !== 1 || shareUserIds[0] !== paidById) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'A private expense must be paid by you and not shared with anyone else',
    });
  }
}

export const expensesRouter = createTRPCRouter({
  // Alle Ausgaben in Gruppenwaehrung fuer die Statistik-Seite (Diagramme werden im Client berechnet)
  stats: groupMemberProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    const expenses = await ctx.db.expense.findMany({
      where: { groupId: input.groupId, OR: [{ isPrivate: false }, { paidById: ctx.user.id }] },
      orderBy: { expenseDate: 'asc' },
      select: {
        id: true,
        title: true,
        amount: true,
        baseCurrencyAmount: true,
        category: true,
        placeName: true,
        latitude: true,
        longitude: true,
        expenseDate: true,
        paidById: true,
        shares: { select: { userId: true, amount: true } },
      },
    });
    return expenses.map((e) => {
      const factor = e.baseCurrencyAmount != null && e.amount > 0 ? e.baseCurrencyAmount / e.amount : 1;
      return {
        id: e.id,
        title: e.title,
        amount: e.baseCurrencyAmount ?? e.amount,
        category: e.category?.trim() || null,
        placeName: e.placeName,
        latitude: e.latitude,
        longitude: e.longitude,
        date: e.expenseDate.toISOString(),
        paidById: e.paidById,
        shares: e.shares.map((sh) => ({ userId: sh.userId, amount: Math.round(sh.amount * factor) })),
      };
    });
  }),

  // Eigene Summen in Gruppenwaehrung: was ich bezahlt habe und mein Anteil an allen Ausgaben
  myTotals: groupMemberProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    const expenses = await ctx.db.expense.findMany({
      where: { groupId: input.groupId, OR: [{ isPrivate: false }, { paidById: ctx.user.id }] },
      select: {
        amount: true,
        baseCurrencyAmount: true,
        category: true,
        paidById: true,
        shares: { where: { userId: ctx.user.id }, select: { amount: true } },
      },
    });
    let paid = 0;
    let share = 0;
    let total = 0;
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      const factor = e.baseCurrencyAmount != null && e.amount > 0 ? e.baseCurrencyAmount / e.amount : 1;
      total += e.baseCurrencyAmount ?? e.amount;
      if (e.paidById === ctx.user.id) paid += e.baseCurrencyAmount ?? e.amount;
      for (const sh of e.shares) {
        const mine = Math.round(sh.amount * factor);
        share += mine;
        const key = e.category?.trim() ?? '';
        byCategory.set(key, (byCategory.get(key) ?? 0) + mine);
      }
    }
    const categories = [...byCategory.entries()]
      .map(([category, amount]) => ({ category: category || null, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { paid, share, total, count: expenses.length, categories };
  }),

  // Ausgangspunkt fuer die Ortssuche: die Unterkunft der Gruppe (Kategorie Unterkunft), sonst der zuletzt
  // erfasste Ort mit Koordinaten. So findet die Suche Lokale in der Naehe statt gleichnamiger am anderen Ende der Welt.
  placeAnchor: groupMemberProcedure.input(z.object({ groupId: z.string() })).query(async ({ ctx, input }) => {
    const base: Prisma.ExpenseWhereInput = {
      groupId: input.groupId,
      latitude: { not: null },
      longitude: { not: null },
      OR: [{ isPrivate: false }, { paidById: ctx.user.id }],
    };
    const row =
      (await ctx.db.expense.findFirst({
        where: { ...base, category: { in: ['Unterkunft', 'Accommodation'], mode: 'insensitive' } },
        orderBy: { expenseDate: 'desc' },
        select: { latitude: true, longitude: true, placeName: true },
      })) ??
      (await ctx.db.expense.findFirst({
        where: base,
        orderBy: { expenseDate: 'desc' },
        select: { latitude: true, longitude: true, placeName: true },
      }));
    if (!row || row.latitude === null || row.longitude === null) return null;
    return { lat: row.latitude, lon: row.longitude, placeName: row.placeName };
  }),

  // Zuletzt besuchte Orte der Gruppe (neueste zuerst), um z. B. ein Restaurant wieder auszuwaehlen.
  // Mit Kategorie: nur Ausgaben dieser Kategorie oder ohne Kategorie (Belege hatten frueher keine).
  recentPlaces: groupMemberProcedure
    .input(z.object({ groupId: z.string(), category: z.string().max(50).optional() }))
    .query(async ({ ctx, input }) => {
      const category = input.category?.trim();
      const rows = await ctx.db.expense.findMany({
        where: {
          groupId: input.groupId,
          placeName: { not: null },
          AND: [
            { OR: [{ isPrivate: false }, { paidById: ctx.user.id }] },
            ...(category
              ? [{ OR: [{ category: { equals: category, mode: 'insensitive' as const } }, { category: null }] }]
              : []),
          ],
        },
        orderBy: { expenseDate: 'desc' },
        take: 200,
        select: { placeName: true, latitude: true, longitude: true, expenseDate: true },
      });
      const places = new Map<
        string,
        { placeName: string; latitude: number | null; longitude: number | null; lastVisit: Date; visits: number }
      >();
      for (const row of rows) {
        const name = row.placeName?.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const known = places.get(key);
        if (known) {
          known.visits += 1;
          if (known.latitude === null && row.latitude !== null) {
            known.latitude = row.latitude;
            known.longitude = row.longitude;
          }
        } else {
          places.set(key, {
            placeName: name,
            latitude: row.latitude,
            longitude: row.longitude,
            lastVisit: row.expenseDate,
            visits: 1,
          });
        }
      }
      return [...places.values()].slice(0, 8);
    }),

  list: groupMemberProcedure
    .input(
      z.object({
        groupId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const expenses = await ctx.db.expense.findMany({
        where: { groupId: input.groupId },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor } } : {}),
        orderBy: { expenseDate: 'desc' },
        include: {
          paidBy: { select: { id: true, name: true, email: true, image: true } },
          shares: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
        },
      });

      let nextCursor: string | undefined;
      if (expenses.length > input.limit) {
        const next = expenses.pop();
        nextCursor = next?.id;
      }

      return { expenses: expenses.map((e) => maskPrivate(e, ctx.user.id)), nextCursor };
    }),

  get: groupMemberProcedure
    .input(z.object({ groupId: z.string(), expenseId: z.string() }))
    .query(async ({ ctx, input }) => {
      const expense = await ctx.db.expense.findUnique({
        where: { id: input.expenseId },
        include: {
          paidBy: { select: { id: true, name: true, email: true, image: true } },
          addedBy: { select: { id: true, name: true, email: true, image: true } },
          shares: {
            include: { user: { select: { id: true, name: true, email: true, image: true } } },
          },
          receipt: true,
        },
      });
      if (!expense || expense.groupId !== input.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return maskPrivate(expense, ctx.user.id);
    }),

  create: groupMemberProcedure
    .input(
      z.object({
        groupId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        amount: z.number().int().positive().max(MAX_MONEY_CENTS),
        currency: z
          .string()
          .length(3)
          .regex(/^[a-zA-Z]{3}$/)
          .transform((c) => c.toUpperCase())
          .default('USD'),
        exchangeRate: exchangeRateSchema.optional(), // manual override
        category: z.string().max(50).optional(),
        placeName: z.string().max(200).optional(),
        isPrivate: z.boolean().optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        expenseDate: z.string().datetime().optional(),
        paidById: z.string(),
        splitMode: z.nativeEnum(SplitMode),
        shares: expenseSharesArraySchema,
        receiptId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Block expenses on archived groups
      const group = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        select: { archivedAt: true, currency: true },
      });
      if (group?.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot add expenses to an archived group',
        });
      }

      // Validate paidById is a member of the group
      const paidByMember = await ctx.db.groupMember.findFirst({
        where: { groupId: input.groupId, userId: input.paidById },
      });
      if (!paidByMember) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Paid-by user is not a member of this group' });
      }

      // Validate all share userIds are group members
      const shareUserIds = input.shares.map((s) => s.userId);
      const memberCount = await ctx.db.groupMember.count({
        where: { groupId: input.groupId, userId: { in: shareUserIds } },
      });
      if (memberCount !== new Set(shareUserIds).size) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more share users are not members of this group',
        });
      }

      // Validate shares sum equals total (in expense's original currency)
      const sharesSum = input.shares.reduce((sum, s) => sum + s.amount, 0);
      if (sharesSum !== input.amount) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Shares sum (${sharesSum}) does not equal expense amount (${input.amount})`,
        });
      }

      if (input.isPrivate) assertPrivateAllowed(input.paidById, shareUserIds, ctx.user.id);

      // Currency conversion: compute base currency amount if currencies differ
      let exchangeRate: number | null = null;
      let baseCurrencyAmount: number | null = null;

      const groupCurrency = group?.currency ?? 'USD';
      if (input.currency.toUpperCase() !== groupCurrency.toUpperCase()) {
        if (input.exchangeRate) {
          // Manual override
          exchangeRate = input.exchangeRate;
        } else {
          // Auto-fetch from frankfurter.app
          const dateStr = input.expenseDate
            ? input.expenseDate.slice(0, 10) // YYYY-MM-DD from ISO string
            : undefined;
          exchangeRate = await getExchangeRate(input.currency, groupCurrency, dateStr);
        }

        if (exchangeRate === null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Could not fetch exchange rate. Please provide a manual rate or try again.',
          });
        }

        baseCurrencyAmount = convertCents(input.amount, exchangeRate);
      }

      const expense = await ctx.db.$transaction(async (tx) => {
        const created = await tx.expense.create({
          data: {
            groupId: input.groupId,
            title: input.title,
            ...(input.description !== undefined ? { description: input.description } : {}),
            amount: input.amount,
            currency: input.currency,
            exchangeRate: exchangeRate ?? 1.0,
            baseCurrencyAmount,
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.placeName ? { placeName: input.placeName } : {}),
            ...(input.isPrivate ? { isPrivate: true } : {}),
            ...(input.latitude !== undefined && input.longitude !== undefined
              ? { latitude: input.latitude, longitude: input.longitude }
              : {}),
            expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
            paidById: input.paidById,
            addedById: ctx.user.id,
            splitMode: input.splitMode,
            ...(input.receiptId !== undefined ? { receiptId: input.receiptId } : {}),
            shares: {
              create: input.shares.map((s) => ({
                userId: s.userId,
                amount: s.amount,
                shares: s.shares ?? 1,
                ...(s.percentage !== undefined ? { percentage: s.percentage } : {}),
              })),
            },
          },
          include: {
            shares: true,
          },
        });

        await tx.activityLog.create({
          data: {
            groupId: input.groupId,
            userId: ctx.user.id,
            type: 'EXPENSE_CREATED',
            entityId: created.id,
            ...(input.isPrivate
              ? {}
              : { metadata: { title: input.title, amount: input.amount, currency: input.currency } }),
          },
        });

        return created;
      });

      return expense;
    }),

  update: groupMemberProcedure
    .input(
      z
        .object({
          groupId: z.string(),
          expenseId: z.string(),
          title: z.string().min(1).max(200).optional(),
          description: z.string().max(1000).optional(),
          amount: z.number().int().positive().max(MAX_MONEY_CENTS).optional(),
          currency: z
            .string()
            .length(3)
            .regex(/^[a-zA-Z]{3}$/)
            .transform((c) => c.toUpperCase())
            .optional(),
          exchangeRate: exchangeRateSchema.optional(), // manual override
          category: z.string().max(50).optional(),
          placeName: z.string().max(200).optional(),
          isPrivate: z.boolean().optional(),
          latitude: z.number().min(-90).max(90).optional(),
          longitude: z.number().min(-180).max(180).optional(),
          expenseDate: z.string().datetime().optional(),
          paidById: z.string().optional(),
          splitMode: z.nativeEnum(SplitMode).optional(),
          shares: expenseSharesArraySchema.optional(),
        })
        .refine((data) => !data.amount || data.shares, {
          message: 'Shares are required when updating the amount',
          path: ['shares'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      // Block updates on archived groups
      const groupCheck = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        select: { archivedAt: true, currency: true },
      });
      if (groupCheck?.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot modify expenses in an archived group',
        });
      }

      const existing = await ctx.db.expense.findUnique({
        where: { id: input.expenseId },
      });
      if (!existing || existing.groupId !== input.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const isOwnerOrAdmin = ctx.membership.role === 'OWNER' || ctx.membership.role === 'ADMIN';
      const isCreatorOrPayer = existing.paidById === ctx.user.id || existing.addedById === ctx.user.id;
      if (!isOwnerOrAdmin && !isCreatorOrPayer) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the expense creator, payer, or group owner/admin can modify this expense',
        });
      }

      // Validate paidById is a member of the group (if provided)
      if (input.paidById) {
        const paidByMember = await ctx.db.groupMember.findFirst({
          where: { groupId: input.groupId, userId: input.paidById },
        });
        if (!paidByMember) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Paid-by user is not a member of this group' });
        }
      }

      const { groupId, expenseId, shares, currency: inputCurrency, exchangeRate: inputExchangeRate, ...data } = input;

      if (shares) {
        // Validate all share userIds are group members
        const shareUserIds = shares.map((s) => s.userId);
        const memberCount = await ctx.db.groupMember.count({
          where: { groupId, userId: { in: shareUserIds } },
        });
        if (memberCount !== new Set(shareUserIds).size) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'One or more share users are not members of this group',
          });
        }

        const expectedAmount = data.amount ?? existing.amount;
        const sharesSum = shares.reduce((sum, s) => sum + s.amount, 0);
        if (sharesSum !== expectedAmount) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Shares sum (${sharesSum}) does not equal expense amount (${expectedAmount})`,
          });
        }
      }

      const effectivePrivate = data.isPrivate ?? existing.isPrivate;
      if (effectivePrivate) {
        const effectivePayer = data.paidById ?? existing.paidById;
        const effectiveShareIds =
          shares?.map((s) => s.userId) ??
          (await ctx.db.expenseShare.findMany({ where: { expenseId }, select: { userId: true } })).map((s) => s.userId);
        assertPrivateAllowed(effectivePayer, effectiveShareIds, ctx.user.id);
      }

      // Recompute currency conversion if currency or amount changed
      const effectiveCurrency = inputCurrency ?? existing.currency;
      const effectiveAmount = data.amount ?? existing.amount;
      const groupCurrency = groupCheck?.currency ?? 'USD';
      let newExchangeRate: number | null = existing.exchangeRate;
      let newBaseCurrencyAmount: number | null = existing.baseCurrencyAmount;

      if (effectiveCurrency.toUpperCase() !== groupCurrency.toUpperCase()) {
        if (inputExchangeRate) {
          newExchangeRate = inputExchangeRate;
        } else if (inputCurrency || data.amount || data.expenseDate) {
          // Currency, amount, or date changed -- re-fetch rate
          const dateStr = (data.expenseDate ?? existing.expenseDate.toISOString()).slice(0, 10);
          const fetched = await getExchangeRate(effectiveCurrency, groupCurrency, dateStr);
          if (fetched === null) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Could not fetch exchange rate. Please provide a manual rate or try again.',
            });
          }
          newExchangeRate = fetched;
        }
        newBaseCurrencyAmount = newExchangeRate ? convertCents(effectiveAmount, newExchangeRate) : null;
      } else {
        // Same currency as group -- clear conversion fields
        newExchangeRate = 1.0;
        newBaseCurrencyAmount = null;
      }

      const expense = await ctx.db.$transaction(async (tx) => {
        if (shares) {
          await tx.expenseShare.deleteMany({ where: { expenseId } });
          await tx.expenseShare.createMany({
            data: shares.map((s) => ({
              expenseId,
              userId: s.userId,
              amount: s.amount,
              shares: s.shares ?? 1,
              ...(s.percentage !== undefined ? { percentage: s.percentage } : {}),
            })),
          });
        }

        const updated = await tx.expense.update({
          where: { id: expenseId },
          data: {
            ...stripUndefined(data),
            ...(inputCurrency ? { currency: inputCurrency } : {}),
            exchangeRate: newExchangeRate ?? 1.0,
            baseCurrencyAmount: newBaseCurrencyAmount,
            ...(data.expenseDate ? { expenseDate: new Date(data.expenseDate) } : {}),
          },
          include: { shares: true },
        });

        // What changed, for the group history (nothing is recorded for private expenses)
        const changes: Record<string, [unknown, unknown]> = {};
        const fieldChanges: Record<string, unknown> = {
          title: data.title,
          amount: data.amount,
          currency: inputCurrency,
          category: data.category,
          placeName: data.placeName,
          paidById: data.paidById,
        };
        for (const [key, value] of Object.entries(fieldChanges)) {
          if (value === undefined) continue;
          const old = existing[key as keyof typeof existing] ?? null;
          if (old !== value) changes[key] = [old, value];
        }
        if (data.expenseDate && new Date(data.expenseDate).getTime() !== existing.expenseDate.getTime()) {
          changes.expenseDate = [existing.expenseDate.toISOString(), new Date(data.expenseDate).toISOString()];
        }
        if (shares) {
          changes.shares = [null, shares.length];
        }

        await tx.activityLog.create({
          data: {
            groupId,
            userId: ctx.user.id,
            type: 'EXPENSE_UPDATED',
            entityId: expenseId,
            ...(updated.isPrivate
              ? {}
              : {
                  metadata: {
                    title: updated.title,
                    amount: updated.amount,
                    currency: updated.currency,
                    ...(Object.keys(changes).length > 0 ? { changes } : {}),
                  } as Prisma.InputJsonValue,
                }),
          },
        });

        return updated;
      });

      return expense;
    }),

  delete: groupMemberProcedure
    .input(z.object({ groupId: z.string(), expenseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const groupCheck = await ctx.db.group.findUnique({
        where: { id: input.groupId },
        select: { archivedAt: true },
      });
      if (groupCheck?.archivedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete expenses from an archived group',
        });
      }

      const expense = await ctx.db.expense.findUnique({
        where: { id: input.expenseId },
      });
      if (!expense || expense.groupId !== input.groupId) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }

      const isOwnerOrAdmin = ctx.membership.role === 'OWNER' || ctx.membership.role === 'ADMIN';
      const isCreatorOrPayer = expense.paidById === ctx.user.id || expense.addedById === ctx.user.id;
      if (!isOwnerOrAdmin && !isCreatorOrPayer) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the expense creator, payer, or group owner/admin can delete this expense',
        });
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.expense.delete({ where: { id: input.expenseId } });

        await tx.activityLog.create({
          data: {
            groupId: input.groupId,
            userId: ctx.user.id,
            type: 'EXPENSE_DELETED',
            entityId: input.expenseId,
            ...(expense.isPrivate
              ? {}
              : { metadata: { title: expense.title, amount: expense.amount, currency: expense.currency } }),
          },
        });
      });

      return { success: true };
    }),
});
