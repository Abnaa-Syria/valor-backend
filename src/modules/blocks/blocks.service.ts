import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { errors } from '../../utils/app-error';
import { playerSummarySelect } from '../users/player-select';

/**
 * Blocking (FR-MOD-4). A block works both ways:
 * - neither player sees the other's profile, clips or comments;
 * - no comments, likes or profile gifts between them;
 * - they are never matched in a battle, and a blocked player's battles don't show
 *   in the other's arena / featured battle.
 * Anonymous battle content is never filtered in a way that could reveal who made a clip.
 */

/** Everyone the player blocked or was blocked by. */
export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId)))];
}

export async function isBlockedBetween(a: string, b: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (a === b) return false;
  const count = await db.userBlock.count({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return count > 0;
}

export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw errors.badRequest("You can't block yourself");
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { status: true } });
  if (!target || target.status === 'DELETED') throw errors.notFound('Player not found');
  await prisma.userBlock.createMany({ data: [{ blockerId: userId, blockedId: targetId }], skipDuplicates: true });
  return { blocked: true };
}

export async function unblockUser(userId: string, targetId: string) {
  await prisma.userBlock.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
  return { blocked: false };
}

/** Players I blocked (settings → blocked players). */
export async function listMyBlocks(userId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, blocked: { select: playerSummarySelect } },
  });
  return rows.map((row) => ({ blockedAt: row.createdAt, player: row.blocked }));
}
