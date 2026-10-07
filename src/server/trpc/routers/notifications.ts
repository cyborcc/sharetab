import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../init';
import { getVapidKeys } from '../../lib/notifications';

/** The bell: stored notifications of the signed-in user, plus the settings and devices for push. */
export const notificationsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const [items, unread] = await Promise.all([
      ctx.db.notification.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: 40 }),
      ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
    ]);
    return { items, unread };
  }),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    ctx.db.notification.count({ where: { userId: ctx.user.id, readAt: null } }),
  ),

  markRead: protectedProcedure.input(z.object({ id: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.user.id, readAt: null, ...(input.id ? { id: input.id } : {}) },
      data: { readAt: new Date() },
    });
    return { success: true };
  }),

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({ where: { id: ctx.user.id }, select: { notifyEnabled: true } });
    const keys = await getVapidKeys(ctx.db);
    return {
      enabled: user?.notifyEnabled ?? true,
      vapidPublicKey: keys.publicKey,
      devices: await ctx.db.pushSubscription.count({ where: { userId: ctx.user.id } }),
    };
  }),

  setEnabled: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    await ctx.db.user.update({ where: { id: ctx.user.id }, data: { notifyEnabled: input.enabled } });
    return { enabled: input.enabled };
  }),

  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url().max(1000),
        p256dh: z.string().max(200),
        auth: z.string().max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: { userId: ctx.user.id, ...input },
        update: { userId: ctx.user.id, p256dh: input.p256dh, auth: input.auth },
      });
      return { success: true };
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({ where: { userId: ctx.user.id, endpoint: input.endpoint } });
      return { success: true };
    }),
});
