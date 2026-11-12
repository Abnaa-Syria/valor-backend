import type { BattleSide, BattleStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { refund, spend } from '../credits/credits.service';
import { notify } from '../notifications/notifications.service';
import { awardBattleGifts } from '../gifts/popularity.service';
import { checkBadges } from '../badges/badges.service';
import { rematchStateFor } from './rematch.service';
import { blockedUserIds } from '../blocks/blocks.service';
import { playerSummarySelect } from '../users/player-select';

/**
 * Battle rules
 * - While voting is live, nobody (players or voters) sees who made which clip, or the vote counts.
 * - One final vote per player per battle, costs 1 Voting Credit, can't be changed.
 * - Players can't vote in their own battle.
 * - When voting ends, a background job closes the battle: counts are taken from the votes table,
 *   the side with more votes wins (equal votes = draw, winnerSide null), identities are revealed.
 */

type Tx = Prisma.TransactionClient;

const playerSelect = playerSummarySelect;
const clipSelect = {
  id: true,
  userId: true,
  title: true,
  videoKey: true,
  thumbnailKey: true,
  durationSec: true,
  user: { select: playerSelect },
} as const;

const battleInclude = {
  game: { select: { id: true, slug: true, name: true } },
  clipA: { select: clipSelect },
  clipB: { select: clipSelect },
} satisfies Prisma.BattleInclude;

type BattleWithClips = Prisma.BattleGetPayload<{ include: typeof battleInclude }>;
type ClipPart = BattleWithClips['clipA'];

function percentages(votesA: number, votesB: number) {
  const total = votesA + votesB;
  if (total === 0) return { totalVotes: 0, percentA: 0, percentB: 0 };
  const percentA = Math.round((votesA / total) * 100);
  return { totalVotes: total, percentA, percentB: 100 - percentA };
}

function sideView(clip: ClipPart, side: BattleSide, viewerId: string, reveal: boolean) {
  return {
    side,
    videoUrl: storage.url(clip.videoKey),
    thumbnailUrl: storage.url(clip.thumbnailKey),
    durationSec: clip.durationSec,
    isMine: clip.userId === viewerId,
    // Identity only after voting has closed.
    clipId: reveal ? clip.id : null,
    title: reveal ? clip.title : null,
    player: reveal ? clip.user : null,
  };
}

function toBattleView(battle: BattleWithClips, viewerId: string, myVote: BattleSide | null) {
  const closed = battle.status === 'CLOSED';
  const isParticipant = battle.clipA.userId === viewerId || battle.clipB.userId === viewerId;
  const votingOpen = battle.status === 'ACTIVE' && battle.votingEndsAt > new Date();

  return {
    id: battle.id,
    status: battle.status,
    game: battle.game,
    votingEndsAt: battle.votingEndsAt,
    closedAt: battle.closedAt,
    isParticipant,
    mySide: battle.clipA.userId === viewerId ? 'A' : battle.clipB.userId === viewerId ? 'B' : null,
    myVote,
    canVote: votingOpen && !isParticipant && !myVote,
    clips: [sideView(battle.clipA, 'A', viewerId, closed), sideView(battle.clipB, 'B', viewerId, closed)],
    results: closed
      ? { winnerSide: battle.winnerSide, votesA: battle.votesA, votesB: battle.votesB, ...percentages(battle.votesA, battle.votesB) }
      : null,
  };
}

async function myVotes(userId: string, battleIds: string[]) {
  const votes = await prisma.vote.findMany({ where: { userId, battleId: { in: battleIds } }, select: { battleId: true, side: true } });
  return new Map(votes.map((vote) => [vote.battleId, vote.side]));
}

// ───────────── Mobile ─────────────

export async function listActiveBattles(viewerId: string, query: Pagination & { gameId?: string }) {
  const hidden = await blockedUserIds(viewerId);
  const where: Prisma.BattleWhereInput = {
    status: 'ACTIVE',
    gameId: query.gameId,
    votingEndsAt: { gt: new Date() },
    ...(hidden.length > 0 && { clipA: { userId: { notIn: hidden } }, clipB: { userId: { notIn: hidden } } }),
  };
  const [battles, total] = await prisma.$transaction([
    prisma.battle.findMany({ where, include: battleInclude, orderBy: { votingEndsAt: 'asc' }, ...toSkipTake(query) }),
    prisma.battle.count({ where }),
  ]);
  const votes = await myVotes(viewerId, battles.map((b) => b.id));
  return paginated(battles.map((b) => toBattleView(b, viewerId, votes.get(b.id) ?? null)), total, query);
}

/** Home "Featured battle": ends soonest, and the player can still vote in it. */
export async function getFeaturedBattle(viewerId: string, gameId?: string) {
  const hidden = await blockedUserIds(viewerId);
  const battle = await prisma.battle.findFirst({
    where: {
      status: 'ACTIVE',
      gameId,
      votingEndsAt: { gt: new Date() },
      votes: { none: { userId: viewerId } },
      clipA: { userId: { notIn: [viewerId, ...hidden] } },
      clipB: { userId: { notIn: [viewerId, ...hidden] } },
    },
    include: battleInclude,
    orderBy: { votingEndsAt: 'asc' },
  });
  return battle ? toBattleView(battle, viewerId, null) : null;
}

export async function getBattle(viewerId: string, battleId: string) {
  const battle = await prisma.battle.findUnique({ where: { id: battleId }, include: battleInclude });
  if (!battle) throw errors.notFound('Battle not found');
  const vote = await prisma.vote.findUnique({ where: { battleId_userId: { battleId, userId: viewerId } }, select: { side: true } });
  const view = toBattleView(battle, viewerId, vote?.side ?? null);
  // Players see whether they can ask for a rematch (design 11 / 11a).
  return { ...view, rematch: view.isParticipant ? await rematchStateFor(viewerId, battleId) : null };
}

export async function castVote(userId: string, battleId: string, side: BattleSide) {
  return prisma.$transaction(async (tx) => {
    // Lock the battle so a vote can't land while the close job is counting.
    await tx.$queryRaw`SELECT id FROM battles WHERE id = ${battleId} FOR UPDATE`;
    const battle = await tx.battle.findUnique({ where: { id: battleId }, include: battleInclude });
    if (!battle) throw errors.notFound('Battle not found');
    if (battle.status !== 'ACTIVE' || battle.votingEndsAt <= new Date()) {
      throw new AppError(409, 'VOTING_CLOSED', 'Voting has closed for this battle');
    }
    if (battle.clipA.userId === userId || battle.clipB.userId === userId) {
      throw new AppError(403, 'OWN_BATTLE', "You can't vote in your own battle");
    }
    const existing = await tx.vote.findUnique({ where: { battleId_userId: { battleId, userId } } });
    if (existing) throw new AppError(409, 'ALREADY_VOTED', 'You already voted in this battle');

    await spend(tx, { userId, type: 'VOTING', reason: 'VOTE', refType: 'battle', refId: battleId });
    await tx.vote.create({ data: { battleId, userId, side } });
    await tx.battle.update({
      where: { id: battleId },
      data: side === 'A' ? { votesA: { increment: 1 } } : { votesB: { increment: 1 } },
    });
    return toBattleView(battle, userId, side);
  });
}

function playerBattlesWhere(userId: string, result?: 'won' | 'lost'): Prisma.BattleWhereInput {
  if (result === 'won') {
    return { OR: [{ winnerSide: 'A', clipA: { userId } }, { winnerSide: 'B', clipB: { userId } }] };
  }
  if (result === 'lost') {
    return { OR: [{ winnerSide: 'B', clipA: { userId } }, { winnerSide: 'A', clipB: { userId } }] };
  }
  return { OR: [{ clipA: { userId } }, { clipB: { userId } }] };
}

/** Wins, losses and win rate over completed battles. Shared by profile, history and dashboard. */
export async function getBattleStats(userId: string) {
  const closed = { status: 'CLOSED' as const };
  const [total, won, lost, votesAsA, votesAsB] = await Promise.all([
    prisma.battle.count({ where: { ...closed, ...playerBattlesWhere(userId) } }),
    prisma.battle.count({ where: { ...closed, ...playerBattlesWhere(userId, 'won') } }),
    prisma.battle.count({ where: { ...closed, ...playerBattlesWhere(userId, 'lost') } }),
    prisma.battle.aggregate({ where: { ...closed, clipA: { userId } }, _sum: { votesA: true } }),
    prisma.battle.aggregate({ where: { ...closed, clipB: { userId } }, _sum: { votesB: true } }),
  ]);
  return {
    total,
    won,
    lost,
    draws: total - won - lost,
    winRate: total > 0 ? Math.round((won / total) * 100) : 0,
    votesReceived: (votesAsA._sum.votesA ?? 0) + (votesAsB._sum.votesB ?? 0),
  };
}

export async function getHistory(userId: string, query: Pagination & { gameId?: string; result?: 'won' | 'lost' }) {
  const where: Prisma.BattleWhereInput = { status: 'CLOSED', gameId: query.gameId, ...playerBattlesWhere(userId, query.result) };
  const [battles, total, stats] = await Promise.all([
    prisma.battle.findMany({ where, include: battleInclude, orderBy: { closedAt: 'desc' }, ...toSkipTake(query) }),
    prisma.battle.count({ where }),
    getBattleStats(userId),
  ]);

  const items = battles.map((battle) => {
    const mySide: BattleSide = battle.clipA.userId === userId ? 'A' : 'B';
    const mine = mySide === 'A' ? battle.clipA : battle.clipB;
    const theirs = mySide === 'A' ? battle.clipB : battle.clipA;
    const split = percentages(battle.votesA, battle.votesB);
    return {
      id: battle.id,
      game: battle.game,
      closedAt: battle.closedAt,
      result: battle.winnerSide === null ? 'DRAW' : battle.winnerSide === mySide ? 'WON' : 'LOST',
      mySide,
      myPercent: mySide === 'A' ? split.percentA : split.percentB,
      totalVotes: split.totalVotes,
      opponent: theirs.user,
      myThumbnailUrl: storage.url(mine.thumbnailKey),
      opponentThumbnailUrl: storage.url(theirs.thumbnailKey),
    };
  });

  return { stats, ...paginated(items, total, query) };
}

// ───────────── Background job ─────────────

export async function closeDueBattles(limit = 100) {
  const due = await prisma.battle.findMany({
    where: { status: 'ACTIVE', votingEndsAt: { lte: new Date() } },
    select: { id: true },
    take: limit,
  });

  for (const { id } of due) {
    const players = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM battles WHERE id = ${id} FOR UPDATE`;
      const battle = await tx.battle.findUnique({
        where: { id },
        select: { status: true, clipA: { select: { userId: true, title: true } }, clipB: { select: { userId: true, title: true } } },
      });
      if (battle?.status !== 'ACTIVE') return [];

      const counts = await tx.vote.groupBy({ by: ['side'], where: { battleId: id }, _count: { _all: true } });
      const votesA = counts.find((c) => c.side === 'A')?._count._all ?? 0;
      const votesB = counts.find((c) => c.side === 'B')?._count._all ?? 0;
      const winnerSide: BattleSide | null = votesA === votesB ? null : votesA > votesB ? 'A' : 'B';

      await tx.battle.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date(), votesA, votesB, winnerSide },
      });
      await awardBattleGifts(tx, id);

      const split = percentages(votesA, votesB);
      for (const side of ['A', 'B'] as const) {
        const clip = side === 'A' ? battle.clipA : battle.clipB;
        const myPercent = side === 'A' ? split.percentA : split.percentB;
        const result = winnerSide === null ? 'draw' : winnerSide === side ? 'won' : 'lost';
        await notify(tx, clip.userId, 'BATTLE_RESULT', {
          title: result === 'won' ? 'You won the battle!' : result === 'lost' ? 'Battle finished' : "It's a draw",
          body: `"${clip.title}" got ${myPercent}% of the final vote.`,
          data: { battleId: id, result },
        });
      }
      return [battle.clipA.userId, battle.clipB.userId];
    });
    for (const userId of players) await checkBadges(userId);
  }
  return due.length;
}

// ───────────── Dashboard ─────────────

function toAdminBattle(battle: BattleWithClips) {
  const side = (clip: ClipPart) => ({
    clipId: clip.id,
    title: clip.title,
    videoUrl: storage.url(clip.videoKey),
    thumbnailUrl: storage.url(clip.thumbnailKey),
    player: clip.user,
  });
  return {
    id: battle.id,
    status: battle.status,
    game: battle.game,
    votingStartsAt: battle.votingStartsAt,
    votingEndsAt: battle.votingEndsAt,
    closedAt: battle.closedAt,
    winnerSide: battle.winnerSide,
    votesA: battle.votesA,
    votesB: battle.votesB,
    ...percentages(battle.votesA, battle.votesB),
    clipA: side(battle.clipA),
    clipB: side(battle.clipB),
  };
}

export async function adminListBattles(query: Pagination & { gameId?: string; status?: BattleStatus }) {
  const where: Prisma.BattleWhereInput = { gameId: query.gameId, status: query.status };
  const [battles, total] = await prisma.$transaction([
    prisma.battle.findMany({ where, include: battleInclude, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.battle.count({ where }),
  ]);
  return paginated(battles.map(toAdminBattle), total, query);
}

export async function adminGetBattle(id: string) {
  const battle = await prisma.battle.findUnique({ where: { id }, include: battleInclude });
  if (!battle) throw errors.notFound('Battle not found');
  return toAdminBattle(battle);
}

/** Cancels a live battle and refunds both entries and every voter. */
export async function cancelBattle(id: string, reason: string, outerTx?: Tx) {
  const run = async (tx: Tx) => {
    await tx.$queryRaw`SELECT id FROM battles WHERE id = ${id} FOR UPDATE`;
    const battle = await tx.battle.findUnique({ where: { id }, select: { status: true } });
    if (!battle) throw errors.notFound('Battle not found');
    if (battle.status !== 'ACTIVE') throw new AppError(409, 'BATTLE_NOT_ACTIVE', 'Only a live battle can be cancelled');

    const note = `Battle cancelled: ${reason}`.slice(0, 255);
    const tickets = await tx.matchmakingTicket.findMany({ where: { battleId: id }, select: { id: true, userId: true } });
    for (const ticket of tickets) {
      await refund(tx, { userId: ticket.userId, type: 'CHALLENGE', reason: 'MATCHMAKING_REFUND', refType: 'ticket', refId: ticket.id, note });
    }
    const votes = await tx.vote.findMany({ where: { battleId: id }, select: { userId: true } });
    for (const vote of votes) {
      await refund(tx, { userId: vote.userId, type: 'VOTING', reason: 'ADMIN_ADJUSTMENT', refType: 'battle', refId: id, note });
    }
    await tx.battle.update({ where: { id }, data: { status: 'CANCELLED', closedAt: new Date() } });
    // Gifts already paid for still reach the players.
    await awardBattleGifts(tx, id);
    // Rematch battles: refund the rematch fees (paid per rematch, not per ticket).
    const rematch = await tx.rematch.findUnique({ where: { battleId: id }, select: { id: true, challengerId: true, opponentId: true } });
    if (rematch) {
      for (const userId of [rematch.challengerId, rematch.opponentId]) {
        await refund(tx, { userId, type: 'CHALLENGE', reason: 'MATCHMAKING_REFUND', refType: 'rematch', refId: rematch.id, note });
      }
    }
    const participants = await tx.battle.findUniqueOrThrow({
      where: { id },
      select: { clipA: { select: { userId: true } }, clipB: { select: { userId: true } } },
    });
    for (const userId of [participants.clipA.userId, participants.clipB.userId]) {
      await notify(tx, userId, 'BATTLE_CANCELLED', {
        title: 'Battle cancelled',
        body: 'A battle you were in was cancelled by VALOR. Your Challenge Credit was refunded.',
        data: { battleId: id },
      });
    }
  };

  if (outerTx) await run(outerTx);
  else await prisma.$transaction(run, { timeout: 30_000 });
}
