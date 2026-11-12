import type { ClipStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { refund } from '../credits/credits.service';
import { getActiveGame } from '../games/games.service';
import { createEntry, getEntry } from '../battles/matchmaking.service';
import { cancelBattle } from '../battles/battles.service';
import { checkBadges } from '../badges/badges.service';
import { blockedUserIds, isBlockedBetween } from '../blocks/blocks.service';
import { clipInclude, liveClipWhere, publicClipWhere, toClipDto } from './clip-dto';
import { CLIPS_PREFIX } from './clip-upload';
import { createClipSchema, type updateClipSchema } from './clips.schemas';
import { playerSummarySelect } from '../users/player-select';

type UploadedFile = { filename: string } | undefined;

/**
 * Publishing a clip (design 02–05): the clip goes to the player's gallery.
 * With `battle` criteria it also enters a 1v1 battle in the same transaction —
 * if that fails (e.g. no Challenge Credits) nothing is saved and the files are deleted.
 */
export async function createClip(userId: string, body: unknown, files: { video: UploadedFile; thumbnail: UploadedFile }) {
  const videoKey = files.video ? storage.keyFor(CLIPS_PREFIX, files.video.filename) : null;
  const thumbnailKey = files.thumbnail ? storage.keyFor(CLIPS_PREFIX, files.thumbnail.filename) : null;

  try {
    const input = createClipSchema.parse(body);
    if (!videoKey) throw errors.badRequest('A video file is required (field "video")');
    await getActiveGame(input.gameId);

    const { clipId, ticketId } = await prisma.$transaction(async (tx) => {
      const clip = await tx.clip.create({
        data: {
          userId,
          gameId: input.gameId,
          title: input.title,
          description: input.description,
          durationSec: input.durationSec,
          videoKey,
          thumbnailKey,
          status: 'READY', // local storage: ready immediately. A video provider would set PROCESSING first.
        },
      });
      const entry = input.battle ? await createEntry(tx, { userId, clipId: clip.id, ...input.battle }) : null;
      return { clipId: clip.id, ticketId: entry?.ticketId ?? null };
    });

    await checkBadges(userId);
    return {
      clip: await getClip(userId, clipId),
      battleEntry: ticketId ? await getEntry(userId, ticketId) : null,
    };
  } catch (err) {
    await Promise.all([storage.remove(videoKey), storage.remove(thumbnailKey)]);
    throw err;
  }
}

async function findVisibleClip(viewerId: string, clipId: string) {
  const clip = await prisma.clip.findUnique({ where: { id: clipId }, include: clipInclude });
  if (!clip || clip.status === 'REMOVED') throw errors.notFound('Clip not found');
  const isLive = clip.tickets.length > 0 || clip.battlesAsA.length > 0 || clip.battlesAsB.length > 0;
  // A live clip is hidden from everyone but its owner, so battles stay anonymous.
  if (clip.userId !== viewerId && (isLive || clip.status !== 'READY')) throw errors.notFound('Clip not found');
  if (clip.userId !== viewerId && (await isBlockedBetween(viewerId, clip.userId))) throw errors.notFound('Clip not found');
  return clip;
}

export async function getClip(viewerId: string, clipId: string) {
  const clip = await findVisibleClip(viewerId, clipId);
  const liked = await prisma.clipLike.findUnique({ where: { userId_clipId: { userId: viewerId, clipId } }, select: { userId: true } });
  return toClipDto(clip, { likedByMe: Boolean(liked) });
}

async function listClips(viewerId: string, where: Prisma.ClipWhereInput, query: Pagination) {
  const [clips, total] = await prisma.$transaction([
    prisma.clip.findMany({ where, include: clipInclude, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.clip.count({ where }),
  ]);
  const liked = await prisma.clipLike.findMany({
    where: { userId: viewerId, clipId: { in: clips.map((c) => c.id) } },
    select: { clipId: true },
  });
  const likedIds = new Set(liked.map((l) => l.clipId));
  return paginated(clips.map((clip) => toClipDto(clip, { likedByMe: likedIds.has(clip.id) })), total, query);
}

/** My gallery: everything I published, including clips in a live battle (flagged in `live`). */
export async function listMyClips(userId: string, query: Pagination & { gameId?: string }) {
  return listClips(userId, { userId, gameId: query.gameId, status: { not: 'REMOVED' } }, query);
}

/** Another player's public clips: live-battle clips are left out. */
export async function listPlayerClips(viewerId: string, playerId: string, query: Pagination & { gameId?: string }) {
  if (viewerId === playerId) return listMyClips(viewerId, query);
  if (await isBlockedBetween(viewerId, playerId)) throw errors.notFound('Player not found');
  return listClips(viewerId, { ...publicClipWhere, userId: playerId, gameId: query.gameId }, query);
}

async function findOwnClip(userId: string, clipId: string) {
  const clip = await prisma.clip.findUnique({ where: { id: clipId }, select: { id: true, userId: true, status: true } });
  if (!clip || clip.userId !== userId || clip.status === 'REMOVED') throw errors.notFound('Clip not found');
  return clip;
}

export async function updateClip(userId: string, clipId: string, input: z.infer<typeof updateClipSchema>) {
  await findOwnClip(userId, clipId);
  await prisma.clip.update({ where: { id: clipId }, data: input });
  return getClip(userId, clipId);
}

/** Soft delete: the file stays because finished battles still show the clip. */
export async function deleteClip(userId: string, clipId: string) {
  await findOwnClip(userId, clipId);
  const live = await prisma.clip.count({ where: { id: clipId, ...liveClipWhere } });
  if (live) throw new AppError(409, 'CLIP_IN_BATTLE', "A clip can't be deleted while it's in a battle");
  await prisma.clip.update({ where: { id: clipId }, data: { status: 'REMOVED', removedAt: new Date() } });
}

// ───────────── Likes ─────────────

export async function likeClip(userId: string, clipId: string) {
  await findVisibleClip(userId, clipId);
  await prisma.$transaction(async (tx) => {
    // Liking twice is a no-op: the duplicate row is skipped and the counter isn't touched.
    const created = await tx.clipLike.createMany({ data: [{ userId, clipId }], skipDuplicates: true });
    if (created.count > 0) await tx.clip.update({ where: { id: clipId }, data: { likesCount: { increment: 1 } } });
  });
  return likeState(userId, clipId);
}

export async function unlikeClip(userId: string, clipId: string) {
  await findVisibleClip(userId, clipId);
  await prisma.$transaction(async (tx) => {
    const removed = await tx.clipLike.deleteMany({ where: { userId, clipId } });
    if (removed.count > 0) await tx.clip.update({ where: { id: clipId }, data: { likesCount: { decrement: 1 } } });
  });
  return likeState(userId, clipId);
}

async function likeState(userId: string, clipId: string) {
  const [clip, like] = await Promise.all([
    prisma.clip.findUniqueOrThrow({ where: { id: clipId }, select: { likesCount: true } }),
    prisma.clipLike.findUnique({ where: { userId_clipId: { userId, clipId } }, select: { userId: true } }),
  ]);
  return { likesCount: clip.likesCount, likedByMe: Boolean(like) };
}

// ───────────── Comments ─────────────

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: playerSummarySelect },
} satisfies Prisma.CommentSelect;

export async function listComments(viewerId: string, clipId: string, query: Pagination) {
  await findVisibleClip(viewerId, clipId);
  const hidden = await blockedUserIds(viewerId);
  const where: Prisma.CommentWhereInput = { clipId, status: 'VISIBLE', ...(hidden.length > 0 && { userId: { notIn: hidden } }) };
  const [comments, total] = await prisma.$transaction([
    prisma.comment.findMany({ where, select: commentSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.comment.count({ where }),
  ]);
  return paginated(comments.map((c) => ({ ...c, isMine: c.user.id === viewerId })), total, query);
}

export async function addComment(userId: string, clipId: string, body: string) {
  await findVisibleClip(userId, clipId);
  const [comment] = await prisma.$transaction([
    prisma.comment.create({ data: { clipId, userId, body }, select: commentSelect }),
    prisma.clip.update({ where: { id: clipId }, data: { commentsCount: { increment: 1 } } }),
  ]);
  return { ...comment, isMine: true };
}

/** The comment's author or the clip's owner can delete it. */
export async function deleteComment(userId: string, clipId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, clipId: true, userId: true, status: true, clip: { select: { userId: true } } },
  });
  if (!comment || comment.clipId !== clipId || comment.status !== 'VISIBLE') throw errors.notFound('Comment not found');
  if (comment.userId !== userId && comment.clip.userId !== userId) throw errors.forbidden();
  await removeComment(commentId);
}

export async function removeComment(commentId: string) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.comment.updateMany({ where: { id: commentId, status: 'VISIBLE' }, data: { status: 'REMOVED' } });
    if (updated.count > 0) {
      const { clipId } = await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { clipId: true } });
      await tx.clip.update({ where: { id: clipId }, data: { commentsCount: { decrement: 1 } } });
    }
  });
}

// ───────────── Dashboard ─────────────

export async function adminListClips(query: Pagination & { gameId?: string; status?: ClipStatus; q?: string }) {
  const where: Prisma.ClipWhereInput = {
    gameId: query.gameId,
    status: query.status,
    ...(query.q && { OR: [{ title: { contains: query.q } }, { user: { username: { contains: query.q } } }] }),
  };
  const [clips, total] = await prisma.$transaction([
    prisma.clip.findMany({ where, include: clipInclude, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.clip.count({ where }),
  ]);
  return paginated(clips.map((clip) => toClipDto(clip)), total, query);
}

/**
 * Moderation removal. If the clip is waiting for an opponent the entry is cancelled and refunded;
 * if it's in a live battle, the battle is cancelled and everyone is refunded.
 */
export async function adminRemoveClip(clipId: string, reason: string) {
  await prisma.$transaction(
    async (tx) => {
      const clip = await tx.clip.findUnique({ where: { id: clipId }, select: { id: true, status: true } });
      if (!clip) throw errors.notFound('Clip not found');
      if (clip.status === 'REMOVED') return;

      const queued = await tx.matchmakingTicket.findMany({ where: { clipId, status: 'QUEUED' }, select: { id: true, userId: true } });
      for (const ticket of queued) {
        await tx.matchmakingTicket.update({ where: { id: ticket.id }, data: { status: 'CANCELLED' } });
        await refund(tx, {
          userId: ticket.userId,
          type: 'CHALLENGE',
          reason: 'MATCHMAKING_REFUND',
          refType: 'ticket',
          refId: ticket.id,
          note: 'Clip removed by moderation',
        });
      }

      const live = await tx.battle.findMany({
        where: { status: 'ACTIVE', OR: [{ clipAId: clipId }, { clipBId: clipId }] },
        select: { id: true },
      });
      for (const battle of live) await cancelBattle(battle.id, `Clip removed: ${reason}`, tx);

      await tx.clip.update({ where: { id: clipId }, data: { status: 'REMOVED', removedAt: new Date() } });
    },
    { timeout: 30_000 },
  );
}
