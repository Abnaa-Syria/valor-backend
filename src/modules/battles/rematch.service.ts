import type { BattleSide, Prisma, Rematch } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, errors } from '../../utils/app-error';
import { refund, spend } from '../credits/credits.service';
import { getSettings } from '../settings/settings.service';
import { notify } from '../notifications/notifications.service';
import { liveClipWhere } from '../clips/clip-dto';
import { playerSummarySelect } from '../users/player-select';

/**
 * Rematch — "Run it back" (design 11a). VALOR v1 rules (client hasn't defined them yet):
 * - Who: the loser of a completed battle (either player after a draw) challenges the other player.
 * - When: within `rematchRequestWindowHours` (default 48h) after the battle closed. One request per battle.
 * - Clips: each player brings a different clip — same game, published, not in another battle,
 *   and not one of the two clips from the original battle.
 * - Cost: 1 Challenge Credit each. The challenger pays when asking, the opponent when accepting.
 * - The opponent has `rematchAcceptHours` (default 24h) to accept or decline.
 *   Declined, expired or cancelled requests refund the challenger.
 * - On accept, the new battle starts right away with random sides and normal voting.
 */

type Tx = Prisma.TransactionClient;

async function lockRematch(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM rematches WHERE id = ${id} FOR UPDATE`;
  return tx.rematch.findUnique({ where: { id } });
}

async function checkClip(tx: Tx, userId: string, clipId: string, gameId: string, excluded: string[]) {
  await tx.$queryRaw`SELECT id FROM clips WHERE id = ${clipId} FOR UPDATE`;
  const clip = await tx.clip.findUnique({ where: { id: clipId }, select: { userId: true, gameId: true, status: true } });
  if (!clip || clip.userId !== userId || clip.status === 'REMOVED') throw errors.notFound('Clip not found');
  if (clip.status !== 'READY') throw errors.badRequest('This clip is still processing');
  if (clip.gameId !== gameId) throw errors.badRequest('The rematch clip must be from the same game');
  if (excluded.includes(clipId)) throw errors.badRequest('Pick a different clip than the one from the first battle');
  const live = await tx.clip.count({ where: { id: clipId, ...liveClipWhere } });
  if (live) throw new AppError(409, 'CLIP_IN_BATTLE', 'This clip is already in a battle');
}

/** Whether the viewer can ask for a rematch of this battle, for the battle screen. */
export async function rematchStateFor(userId: string, battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    select: {
      status: true,
      closedAt: true,
      winnerSide: true,
      clipA: { select: { userId: true } },
      clipB: { select: { userId: true } },
      rematchRequest: { select: { id: true, status: true, challengerId: true, battleId: true, expiresAt: true } },
    },
  });
  if (!battle) return null;
  const mySide: BattleSide | null = battle.clipA.userId === userId ? 'A' : battle.clipB.userId === userId ? 'B' : null;
  if (!mySide) return null;

  const { rematchRequestWindowHours } = await getSettings();
  const windowEnds = battle.closedAt ? new Date(battle.closedAt.getTime() + rematchRequestWindowHours * 3600 * 1000) : null;
  const isLoserOrDraw = battle.winnerSide === null || battle.winnerSide !== mySide;
  const canRequest =
    battle.status === 'CLOSED' && !battle.rematchRequest && isLoserOrDraw && windowEnds !== null && windowEnds > new Date();

  return { canRequest, requestWindowEndsAt: canRequest ? windowEnds : null, request: battle.rematchRequest };
}

export async function requestRematch(userId: string, battleId: string, clipId: string) {
  const settings = await getSettings();
  const rematch = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM battles WHERE id = ${battleId} FOR UPDATE`;
    const battle = await tx.battle.findUnique({
      where: { id: battleId },
      select: {
        status: true,
        closedAt: true,
        winnerSide: true,
        gameId: true,
        clipA: { select: { id: true, userId: true } },
        clipB: { select: { id: true, userId: true } },
        rematchRequest: { select: { id: true } },
        game: { select: { name: true } },
      },
    });
    if (!battle) throw errors.notFound('Battle not found');

    const mySide: BattleSide | null = battle.clipA.userId === userId ? 'A' : battle.clipB.userId === userId ? 'B' : null;
    if (!mySide) throw errors.forbidden('Only the players of this battle can ask for a rematch');
    if (battle.status !== 'CLOSED' || !battle.closedAt) throw new AppError(409, 'BATTLE_NOT_FINISHED', 'The battle has to finish first');
    if (battle.winnerSide === mySide) throw new AppError(403, 'WINNER_CANNOT_REQUEST', 'Only the player who lost can ask for a rematch');
    if (battle.rematchRequest) throw new AppError(409, 'REMATCH_EXISTS', 'A rematch was already requested for this battle');
    const windowEnds = battle.closedAt.getTime() + settings.rematchRequestWindowHours * 3600 * 1000;
    if (Date.now() > windowEnds) throw new AppError(409, 'REMATCH_WINDOW_CLOSED', 'The time to ask for a rematch has passed');

    const opponentId = mySide === 'A' ? battle.clipB.userId : battle.clipA.userId;
    await checkClip(tx, userId, clipId, battle.gameId, [battle.clipA.id, battle.clipB.id]);

    const created = await tx.rematch.create({
      data: {
        originalBattleId: battleId,
        challengerId: userId,
        opponentId,
        challengerClipId: clipId,
        expiresAt: new Date(Date.now() + settings.rematchAcceptHours * 3600 * 1000),
      },
    });
    await spend(tx, { userId, type: 'CHALLENGE', reason: 'BATTLE_ENTRY', refType: 'rematch', refId: created.id });

    const challenger = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    await notify(tx, opponentId, 'REMATCH_REQUESTED', {
      title: 'Rematch request',
      body: `${challenger.username} wants to run it back in ${battle.game.name}.`,
      data: { rematchId: created.id, battleId },
    });
    return created;
  });
  return getRematch(userId, rematch.id);
}

export async function acceptRematch(userId: string, rematchId: string, clipId: string) {
  const settings = await getSettings();
  await prisma.$transaction(async (tx) => {
    const rematch = await lockRematch(tx, rematchId);
    assertPendingFor(rematch, userId, 'opponent');

    const original = await tx.battle.findUniqueOrThrow({
      where: { id: rematch!.originalBattleId },
      select: { gameId: true, clipAId: true, clipBId: true },
    });
    await checkClip(tx, userId, clipId, original.gameId, [original.clipAId, original.clipBId]);
    // The challenger's clip may have entered another battle meanwhile.
    const challengerLive = await tx.clip.count({ where: { id: rematch!.challengerClipId, ...liveClipWhere } });
    const challengerClip = await tx.clip.findUnique({ where: { id: rematch!.challengerClipId }, select: { status: true } });
    if (challengerLive || challengerClip?.status !== 'READY') {
      throw new AppError(409, 'CHALLENGER_CLIP_UNAVAILABLE', "The challenger's clip is no longer available");
    }

    await spend(tx, { userId, type: 'CHALLENGE', reason: 'BATTLE_ENTRY', refType: 'rematch', refId: rematchId });

    const now = new Date();
    const [clipAId, clipBId] = Math.random() < 0.5 ? [rematch!.challengerClipId, clipId] : [clipId, rematch!.challengerClipId];
    const battle = await tx.battle.create({
      data: {
        gameId: original.gameId,
        clipAId,
        clipBId,
        votingStartsAt: now,
        votingEndsAt: new Date(now.getTime() + settings.votingDurationHours * 3600 * 1000),
      },
    });
    await tx.rematch.update({
      where: { id: rematchId },
      data: { status: 'ACCEPTED', opponentClipId: clipId, battleId: battle.id, respondedAt: now },
    });

    const opponent = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    await notify(tx, rematch!.challengerId, 'REMATCH_ACCEPTED', {
      title: 'Rematch accepted',
      body: `${opponent.username} accepted. Your rematch is live — voting is open.`,
      data: { rematchId, battleId: battle.id },
    });
  });
  return getRematch(userId, rematchId);
}

export async function declineRematch(userId: string, rematchId: string) {
  await closeRematch(rematchId, 'DECLINED', userId);
  return getRematch(userId, rematchId);
}

export async function cancelRematch(userId: string, rematchId: string) {
  await closeRematch(rematchId, 'CANCELLED', userId);
  return getRematch(userId, rematchId);
}

function assertPendingFor(rematch: Rematch | null, userId: string, role: 'opponent' | 'challenger') {
  const isMine = rematch && (role === 'opponent' ? rematch.opponentId === userId : rematch.challengerId === userId);
  if (!rematch || !isMine) throw errors.notFound('Rematch not found');
  if (rematch.status !== 'PENDING') throw new AppError(409, 'REMATCH_NOT_PENDING', 'This rematch is no longer waiting for an answer');
  if (rematch.expiresAt <= new Date()) throw new AppError(409, 'REMATCH_EXPIRED', 'This rematch request has expired');
}

/** Declined by the opponent, cancelled by the challenger, or expired by the job. Refunds the challenger. */
async function closeRematch(rematchId: string, status: 'DECLINED' | 'CANCELLED' | 'EXPIRED', actorId?: string) {
  await prisma.$transaction(async (tx) => {
    const rematch = await lockRematch(tx, rematchId);
    if (status === 'DECLINED') assertPendingFor(rematch, actorId!, 'opponent');
    if (status === 'CANCELLED') {
      if (!rematch || rematch.challengerId !== actorId) throw errors.notFound('Rematch not found');
      if (rematch.status !== 'PENDING') throw new AppError(409, 'REMATCH_NOT_PENDING', 'This rematch is no longer waiting for an answer');
    }
    if (status === 'EXPIRED' && rematch?.status !== 'PENDING') return;

    await tx.rematch.update({ where: { id: rematchId }, data: { status, respondedAt: new Date() } });
    await refund(tx, {
      userId: rematch!.challengerId,
      type: 'CHALLENGE',
      reason: 'MATCHMAKING_REFUND',
      refType: 'rematch',
      refId: rematchId,
      note: `Rematch ${status.toLowerCase()}`,
    });

    if (status === 'DECLINED' || status === 'EXPIRED') {
      const opponent = await tx.user.findUniqueOrThrow({ where: { id: rematch!.opponentId }, select: { username: true } });
      await notify(tx, rematch!.challengerId, status === 'DECLINED' ? 'REMATCH_DECLINED' : 'REMATCH_EXPIRED', {
        title: status === 'DECLINED' ? 'Rematch declined' : 'Rematch expired',
        body:
          status === 'DECLINED'
            ? `${opponent.username} declined the rematch. Your Challenge Credit was refunded.`
            : `${opponent.username} didn't answer in time. Your Challenge Credit was refunded.`,
        data: { rematchId },
      });
    }
  });
}

/** Background job. */
export async function expireRematches(limit = 100) {
  const due = await prisma.rematch.findMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    select: { id: true },
    take: limit,
  });
  for (const { id } of due) await closeRematch(id, 'EXPIRED');
  return due.length;
}

const rematchSelect = {
  id: true,
  status: true,
  originalBattleId: true,
  battleId: true,
  expiresAt: true,
  respondedAt: true,
  createdAt: true,
  challengerClipId: true,
  opponentClipId: true,
  challenger: { select: playerSummarySelect },
  opponent: { select: playerSummarySelect },
  originalBattle: { select: { game: { select: { id: true, name: true, slug: true } } } },
} satisfies Prisma.RematchSelect;

export async function getRematch(userId: string, rematchId: string) {
  const rematch = await prisma.rematch.findFirst({
    where: { id: rematchId, OR: [{ challengerId: userId }, { opponentId: userId }] },
    select: rematchSelect,
  });
  if (!rematch) throw errors.notFound('Rematch not found');
  return { ...rematch, role: rematch.challenger.id === userId ? 'CHALLENGER' : 'OPPONENT' };
}

export async function listMyRematches(userId: string) {
  const rematches = await prisma.rematch.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    select: rematchSelect,
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return rematches.map((r) => ({ ...r, role: r.challenger.id === userId ? 'CHALLENGER' : 'OPPONENT' }));
}
