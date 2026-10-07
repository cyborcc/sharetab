import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../init';
import { adminProcedure } from './admin';
import { checkRateLimit } from '../../lib/rate-limit';

const kindSchema = z.enum(['BUG', 'IDEA']);
const statusSchema = z.enum(['OPEN', 'APPROVED', 'DONE', 'REJECTED']);

/**
 * Issues and ideas from users. Everyone signed in can post and sees all entries; the admin
 * confirms (APPROVED = "please build it"), rejects or marks them done.
 */
export const feedbackRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const items = await ctx.db.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, name: true, image: true } } },
    });
    return items.map((f) => ({
      id: f.id,
      kind: f.kind,
      title: f.title,
      body: f.body,
      status: f.status,
      adminNote: f.adminNote,
      createdAt: f.createdAt,
      user: f.user,
      mine: f.userId === ctx.user.id,
    }));
  }),

  create: protectedProcedure
    .input(z.object({ kind: kindSchema, title: z.string().trim().min(3).max(120), body: z.string().trim().max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const limit = checkRateLimit(`feedback:${ctx.user.id}`, 20, 60 * 60 * 1000);
      if (!limit.allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many entries, try later' });
      return ctx.db.feedback.create({
        data: { kind: input.kind, title: input.title, body: input.body, userId: ctx.user.id },
        select: { id: true },
      });
    }),

  /** Authors can withdraw their own entry while it is open. */
  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const item = await ctx.db.feedback.findUnique({ where: { id: input.id } });
    if (!item || item.userId !== ctx.user.id || item.status !== 'OPEN') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only your own open entries can be removed' });
    }
    await ctx.db.feedback.delete({ where: { id: input.id } });
    return { success: true };
  }),

  setStatus: adminProcedure
    .input(z.object({ id: z.string(), status: statusSchema, adminNote: z.string().trim().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.feedback.update({
        where: { id: input.id },
        data: {
          status: input.status,
          ...(input.adminNote !== undefined ? { adminNote: input.adminNote || null } : {}),
        },
        select: { id: true, status: true },
      });
    }),

  /** Whether the viewer may confirm entries (drives the buttons; setStatus enforces it). */
  isAdmin: protectedProcedure.query(({ ctx }) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    const email = ctx.impersonating ? ctx.impersonating.adminEmail : ctx.user.email;
    return { admin: !!adminEmail && email === adminEmail };
  }),
});
