import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { usernameSchema } from '../auth/auth.schemas';
import * as authService from '../auth/auth.service';
import { playerSummarySelect } from './player-select';

/** Dashboard-only player management (create, edit, password, gifts, blocks, export). */

export const adminCreatePlayerSchema = z.object({
  username: usernameSchema,
  email: z.email().trim().toLowerCase().max(191),
  password: z.string().min(8).max(100),
});

export const adminUpdatePlayerSchema = z.object({
  username: usernameSchema.optional(),
  email: z.email().trim().toLowerCase().max(191).optional(),
  avatarUrl: z.url().max(500).nullable().optional(),
  bannerUrl: z.url().max(500).nullable().optional(),
  hideReferralCount: z.boolean().optional(),
});

async function assertEditable(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: { status: true } });
  if (!user) throw errors.notFound('Player not found');
  if (user.status === 'DELETED') throw new AppError(409, 'ACCOUNT_DELETED', 'This account was deleted by the player');
}

export async function createPlayer(input: z.infer<typeof adminCreatePlayerSchema>) {
  const result = await authService.register(input);
  return result.user;
}

export async function updatePlayer(id: string, input: z.infer<typeof adminUpdatePlayerSchema>) {
  await assertEditable(id);
  const conflicts = await prisma.user.findMany({
    where: {
      id: { not: id },
      OR: [...(input.username ? [{ username: input.username }] : []), ...(input.email ? [{ email: input.email }] : [])],
    },
    select: { username: true, email: true },
  });
  if (conflicts.length > 0 && (input.username || input.email)) {
    const fields = [
      ...(conflicts.some((c) => c.username === input.username) ? ['username'] : []),
      ...(conflicts.some((c) => c.email === input.email) ? ['email'] : []),
    ];
    if (fields.length) throw new AppError(409, 'CONFLICT', 'Already used by another player', { fields });
  }
  return prisma.user.update({ where: { id }, data: input, select: { id: true, username: true, email: true } });
}

/** Sets a new password and signs the player out everywhere. */
export async function setPassword(id: string, password: string) {
  await assertEditable(id);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export async function sendPasswordReset(id: string) {
  await assertEditable(id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
  await authService.forgotPassword(user.email);
}

export async function listPlayerGifts(id: string, direction: 'received' | 'sent', query: Pagination) {
  const where: Prisma.GiftTransactionWhereInput = direction === 'received' ? { recipientId: id } : { senderId: id };
  const [items, total] = await prisma.$transaction([
    prisma.giftTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        gift: { select: { name: true, tier: true, iconUrl: true } },
        sender: { select: { id: true, username: true } },
        recipient: { select: { id: true, username: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.giftTransaction.count({ where }),
  ]);
  return paginated(items, total, query);
}

/** Both directions: who the player blocked, and who blocked them. */
export async function listPlayerBlocks(id: string) {
  const [made, received] = await Promise.all([
    prisma.userBlock.findMany({ where: { blockerId: id }, select: { createdAt: true, blocked: { select: playerSummarySelect } } }),
    prisma.userBlock.findMany({ where: { blockedId: id }, select: { createdAt: true, blocker: { select: playerSummarySelect } } }),
  ]);
  return {
    blocked: made.map((row) => ({ at: row.createdAt, player: row.blocked })),
    blockedBy: received.map((row) => ({ at: row.createdAt, player: row.blocker })),
  };
}

/** Everything VALOR holds about a player, as JSON (PDPL access request). */
export async function exportPlayer(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      clips: { select: { id: true, title: true, description: true, status: true, createdAt: true, gameId: true } },
      comments: { select: { id: true, clipId: true, body: true, status: true, createdAt: true } },
      votes: { select: { battleId: true, side: true, createdAt: true } },
      tickets: { select: { id: true, clipId: true, status: true, weaponClass: true, rank: true, createdAt: true } },
      balances: { select: { type: true, freeBalance: true, purchasedBalance: true } },
      ledger: { select: { type: true, source: true, amount: true, reason: true, note: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      purchases: { select: { storeProductId: true, kind: true, quantity: true, priceSar: true, status: true, createdAt: true } },
      giftsSent: { select: { giftId: true, recipientId: true, quantity: true, createdAt: true } },
      giftsReceived: { select: { giftId: true, senderId: true, quantity: true, popularityAwarded: true, createdAt: true } },
      cosmetics: { select: { itemId: true, acquiredAt: true } },
      badges: { select: { badgeId: true, earnedAt: true } },
      popularityEvents: { select: { amount: true, source: true, createdAt: true } },
      referralsMade: { select: { inviteeId: true, pointsAwarded: true, createdAt: true } },
      reports: { select: { targetType: true, targetId: true, reason: true, status: true, createdAt: true } },
      blocksMade: { select: { blockedId: true, createdAt: true } },
    },
  });
  if (!user) throw errors.notFound('Player not found');
  const { passwordHash: _password, ...profile } = user;
  return { exportedAt: new Date(), player: profile };
}
