import { z } from 'zod';
import type { CommentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { clipInclude, toClipDto } from './clip-dto';

/** Dashboard-only clip and comment management. */

export const adminUpdateClipSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  gameId: z.string().min(1).max(30).optional(),
});

export async function adminGetClip(id: string) {
  const clip = await prisma.clip.findUnique({ where: { id }, include: clipInclude });
  if (!clip) throw errors.notFound('Clip not found');

  const [battles, reports, likes] = await Promise.all([
    prisma.battle.findMany({
      where: { OR: [{ clipAId: id }, { clipBId: id }] },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        clipAId: true,
        winnerSide: true,
        votesA: true,
        votesB: true,
        votingEndsAt: true,
        closedAt: true,
        clipA: { select: { user: { select: { username: true } } } },
        clipB: { select: { user: { select: { username: true } } } },
      },
    }),
    prisma.report.count({ where: { targetType: 'CLIP', targetId: id } }),
    prisma.clipLike.findMany({
      where: { clipId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { createdAt: true, user: { select: { id: true, username: true } } },
    }),
  ]);

  return {
    ...toClipDto(clip),
    removedAt: clip.removedAt,
    updatedAt: clip.updatedAt,
    reportsCount: reports,
    likes,
    battles: battles.map((b) => {
      const side = b.clipAId === id ? 'A' : 'B';
      return {
        id: b.id,
        status: b.status,
        side,
        opponent: side === 'A' ? b.clipB.user.username : b.clipA.user.username,
        result: b.status !== 'CLOSED' ? null : b.winnerSide === null ? 'DRAW' : b.winnerSide === side ? 'WON' : 'LOST',
        votesFor: side === 'A' ? b.votesA : b.votesB,
        votesAgainst: side === 'A' ? b.votesB : b.votesA,
        endsAt: b.closedAt ?? b.votingEndsAt,
      };
    }),
  };
}

export async function adminUpdateClip(id: string, input: z.infer<typeof adminUpdateClipSchema>) {
  const clip = await prisma.clip.findUnique({ where: { id }, select: { id: true } });
  if (!clip) throw errors.notFound('Clip not found');
  if (input.gameId) {
    const live = await prisma.matchmakingTicket.count({ where: { clipId: id, status: 'QUEUED' } });
    const inBattle = await prisma.battle.count({ where: { OR: [{ clipAId: id }, { clipBId: id }] } });
    if (live || inBattle) throw new AppError(409, 'CLIP_IN_BATTLE', "The game can't change once the clip has been in a battle");
  }
  await prisma.clip.update({ where: { id }, data: input });
  return adminGetClip(id);
}

export async function adminRestoreClip(id: string) {
  const clip = await prisma.clip.findUnique({ where: { id }, select: { status: true, videoKey: true, user: { select: { status: true } } } });
  if (!clip) throw errors.notFound('Clip not found');
  if (clip.status !== 'REMOVED') throw new AppError(409, 'NOT_REMOVED', 'This clip is not removed');
  if (clip.user.status === 'DELETED') throw new AppError(409, 'ACCOUNT_DELETED', "The owner deleted their account; the clip can't come back");
  await prisma.clip.update({ where: { id }, data: { status: 'READY', removedAt: null } });
  return adminGetClip(id);
}

// ───────────── Comments ─────────────

export async function adminListComments(query: Pagination & { q?: string; clipId?: string; userId?: string; status?: CommentStatus }) {
  const where: Prisma.CommentWhereInput = {
    clipId: query.clipId,
    userId: query.userId,
    status: query.status,
    ...(query.q && { OR: [{ body: { contains: query.q } }, { user: { username: { contains: query.q } } }] }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        clip: { select: { id: true, title: true, thumbnailKey: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.comment.count({ where }),
  ]);
  const withReports = await prisma.report.groupBy({
    by: ['targetId'],
    where: { targetType: 'COMMENT', targetId: { in: items.map((c) => c.id) } },
    _count: { _all: true },
  });
  const reportCount = new Map(withReports.map((r) => [r.targetId, r._count._all]));
  return paginated(
    items.map(({ clip, ...comment }) => ({
      ...comment,
      clip: { id: clip.id, title: clip.title, thumbnailUrl: storage.url(clip.thumbnailKey) },
      reportsCount: reportCount.get(comment.id) ?? 0,
    })),
    total,
    query,
  );
}

export async function adminSetCommentStatus(id: string, status: CommentStatus) {
  await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.findUnique({ where: { id }, select: { status: true, clipId: true } });
    if (!comment) throw errors.notFound('Comment not found');
    if (comment.status === status) return;
    await tx.comment.update({ where: { id }, data: { status } });
    await tx.clip.update({
      where: { id: comment.clipId },
      data: { commentsCount: status === 'VISIBLE' ? { increment: 1 } : { decrement: 1 } },
    });
  });
}
