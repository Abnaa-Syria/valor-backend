import type { MatchmakingTicket, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, errors } from '../../utils/app-error';
import { refund, spend } from '../credits/credits.service';
import { getSetting, getSettings } from '../settings/settings.service';
import { parseCriteria } from '../games/games.schemas';
import { liveClipWhere } from '../clips/clip-dto';
import { notify } from '../notifications/notifications.service';

/**
 * Matchmaking rules (v1)
 * - Entering costs 1 Challenge Credit, taken when the ticket is created.
 * - Two tickets match when: same game, same weapon class, same rank, different players.
 *   (Exact match for now; the client hasn't confirmed rank ranges — see decision register.)
 * - A ticket that finds no opponent before `matchmakingTimeoutMinutes` expires and is refunded.
 * - A player can cancel a waiting ticket and get the credit back.
 * - Sides A/B are assigned at random so the order of entry reveals nothing.
 */

type Tx = Prisma.TransactionClient;

export async function createEntry(
  tx: Tx,
  input: { userId: string; clipId: string; weaponClass: string; rank: string },
) {
  // Lock the clip so two parallel requests can't enter it twice.
  await tx.$queryRaw`SELECT id FROM clips WHERE id = ${input.clipId} FOR UPDATE`;
  const clip = await tx.clip.findUnique({ where: { id: input.clipId }, include: { game: true } });
  if (!clip || clip.userId !== input.userId || clip.status === 'REMOVED') throw errors.notFound('Clip not found');
  if (clip.status !== 'READY') throw errors.badRequest('This clip is still processing');
  if (!clip.game.isActive) throw errors.badRequest('This game is not available');

  const alreadyLive = await tx.clip.count({ where: { id: clip.id, ...liveClipWhere } });
  if (alreadyLive) throw new AppError(409, 'CLIP_IN_BATTLE', 'This clip is already in a battle');

  const criteria = parseCriteria(clip.game.criteria);
  if (criteria.weaponClasses.length > 0 && !criteria.weaponClasses.includes(input.weaponClass)) {
    throw errors.badRequest('Unknown weapon class for this game', { allowed: criteria.weaponClasses });
  }
  if (criteria.ranks.length > 0 && !criteria.ranks.includes(input.rank)) {
    throw errors.badRequest('Unknown rank for this game', { allowed: criteria.ranks });
  }

  const settings = await getSettings();
  const ticket = await tx.matchmakingTicket.create({
    data: {
      userId: input.userId,
      clipId: clip.id,
      gameId: clip.gameId,
      weaponClass: input.weaponClass,
      rank: input.rank,
      expiresAt: new Date(Date.now() + settings.matchmakingTimeoutMinutes * 60 * 1000),
    },
  });
  await spend(tx, { userId: input.userId, type: 'CHALLENGE', reason: 'BATTLE_ENTRY', refType: 'ticket', refId: ticket.id });

  const battle = await tryMatch(tx, ticket, settings.votingDurationHours);
  return { ticketId: ticket.id, battleId: battle?.id ?? null };
}

async function tryMatch(tx: Tx, ticket: MatchmakingTicket, votingHours: number) {
  const now = new Date();
  // SKIP LOCKED: tickets another request is matching right now are ignored, not waited on.
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM matchmaking_tickets t
    WHERE gameId = ${ticket.gameId}
      AND status = 'QUEUED'
      AND weaponClass = ${ticket.weaponClass}
      AND \`rank\` = ${ticket.rank}
      AND userId <> ${ticket.userId}
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
        WHERE (b.blockerId = ${ticket.userId} AND b.blockedId = t.userId)
           OR (b.blockerId = t.userId AND b.blockedId = ${ticket.userId})
      )
      AND id <> ${ticket.id}
      AND (expiresAt IS NULL OR expiresAt > ${now})
    ORDER BY createdAt ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED`;
  if (rows.length === 0) return null;

  const opponent = await tx.matchmakingTicket.findUniqueOrThrow({ where: { id: rows[0].id } });
  return startBattle(tx, ticket, opponent, votingHours);
}

/** Pairs two waiting tickets into a live battle (random sides) and tells both players. */
export async function startBattle(tx: Tx, ticket: MatchmakingTicket, opponent: MatchmakingTicket, votingHours: number) {
  const now = new Date();
  const [sideA, sideB] = Math.random() < 0.5 ? [ticket, opponent] : [opponent, ticket];

  const battle = await tx.battle.create({
    data: {
      gameId: ticket.gameId,
      clipAId: sideA.clipId,
      clipBId: sideB.clipId,
      votingStartsAt: now,
      votingEndsAt: new Date(now.getTime() + votingHours * 60 * 60 * 1000),
    },
  });
  await tx.matchmakingTicket.updateMany({
    where: { id: { in: [ticket.id, opponent.id] } },
    data: { status: 'MATCHED', battleId: battle.id, matchedAt: now },
  });
  for (const entry of [ticket, opponent]) {
    await notify(tx, entry.userId, 'MATCH_FOUND', {
      title: 'Opponent found',
      body: `Your clip is in a blind 1v1 battle. Voting is open for ${votingHours} hours.`,
      data: { battleId: battle.id, clipId: entry.clipId },
    });
  }
  return battle;
}

async function lockQueuedTicket(tx: Tx, ticketId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM matchmaking_tickets WHERE id = ${ticketId} AND status = 'QUEUED' FOR UPDATE SKIP LOCKED`;
  return rows.length > 0 ? tx.matchmakingTicket.findUniqueOrThrow({ where: { id: ticketId } }) : null;
}

/** Background job: retries matching for waiting tickets (catches tickets that entered at the same moment). */
export async function matchQueuedTickets(limit = 100) {
  const queued = await prisma.matchmakingTicket.findMany({
    where: { status: 'QUEUED', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    take: limit,
  });
  if (queued.length < 2) return 0;

  const votingHours = await getSetting('votingDurationHours');
  let matched = 0;
  for (const { id } of queued) {
    const battle = await prisma.$transaction(async (tx) => {
      const ticket = await lockQueuedTicket(tx, id);
      return ticket ? tryMatch(tx, ticket, votingHours) : null;
    });
    if (battle) matched++;
  }
  return matched;
}

/** Background job: expires tickets that waited too long and refunds the Challenge Credit. */
export async function expireTickets(limit = 100) {
  const due = await prisma.matchmakingTicket.findMany({
    where: { status: 'QUEUED', expiresAt: { lte: new Date() } },
    select: { id: true },
    take: limit,
  });
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const ticket = await lockQueuedTicket(tx, id);
      if (!ticket) return;
      await tx.matchmakingTicket.update({ where: { id }, data: { status: 'EXPIRED' } });
      await refund(tx, {
        userId: ticket.userId,
        type: 'CHALLENGE',
        reason: 'MATCHMAKING_REFUND',
        refType: 'ticket',
        refId: ticket.id,
        note: 'No opponent found in time',
      });
      await notify(tx, ticket.userId, 'ENTRY_EXPIRED', {
        title: 'No opponent found',
        body: "We couldn't find an opponent in time. Your Challenge Credit was refunded.",
        data: { entryId: ticket.id, clipId: ticket.clipId },
      });
    });
  }
  return due.length;
}

export async function cancelEntry(userId: string, ticketId: string) {
  await prisma.$transaction(async (tx) => {
    const ticket = await lockQueuedTicket(tx, ticketId);
    if (!ticket || ticket.userId !== userId) {
      const exists = await tx.matchmakingTicket.findFirst({ where: { id: ticketId, userId }, select: { status: true } });
      if (!exists) throw errors.notFound('Battle entry not found');
      throw new AppError(409, 'ENTRY_NOT_WAITING', 'This entry is no longer waiting for an opponent');
    }
    await tx.matchmakingTicket.update({ where: { id: ticketId }, data: { status: 'CANCELLED' } });
    await refund(tx, {
      userId,
      type: 'CHALLENGE',
      reason: 'MATCHMAKING_REFUND',
      refType: 'ticket',
      refId: ticketId,
      note: 'Entry cancelled by player',
    });
  });
  return getEntry(userId, ticketId);
}

const entrySelect = {
  id: true,
  status: true,
  clipId: true,
  weaponClass: true,
  rank: true,
  battleId: true,
  createdAt: true,
  matchedAt: true,
  expiresAt: true,
  game: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.MatchmakingTicketSelect;

export async function getEntry(userId: string, ticketId: string) {
  const entry = await prisma.matchmakingTicket.findFirst({ where: { id: ticketId, userId }, select: entrySelect });
  if (!entry) throw errors.notFound('Battle entry not found');
  return entry;
}

export async function listMyEntries(userId: string) {
  return prisma.matchmakingTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: entrySelect,
    take: 20,
  });
}
