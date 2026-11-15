import type { Prisma, RematchStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { refund } from '../credits/credits.service';
import { notify } from '../notifications/notifications.service';
import { adminGetBattle, closeBattle } from './battles.service';
import { startBattle } from './matchmaking.service';
import { getSetting } from '../settings/settings.service';
import { blockedUserIds, isBlockedBetween } from '../blocks/blocks.service';

/** Dashboard-only battle tools: full battle record, close now, extend, entries, rematches. */

export async function adminBattleDetail(id: string) {
  const battle = await adminGetBattle(id);
  const [votes, gifts, tickets, rematchFrom, rematchOf] = await Promise.all([
    prisma.vote.findMany({
      where: { battleId: id },
      orderBy: { createdAt: 'desc' },
      select: { side: true, createdAt: true, user: { select: { id: true, username: true } } },
    }),
    prisma.giftTransaction.findMany({
      where: { battleId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        battleSide: true,
        quantity: true,
        popularityAwarded: true,
        awardedAt: true,
        createdAt: true,
        gift: { select: { name: true } },
        sender: { select: { id: true, username: true } },
      },
    }),
    prisma.matchmakingTicket.findMany({
      where: { battleId: id },
      select: { id: true, weaponClass: true, rank: true, createdAt: true, matchedAt: true, user: { select: { username: true } } },
    }),
    prisma.rematch.findUnique({ where: { originalBattleId: id }, select: { id: true, status: true, battleId: true } }),
    prisma.rematch.findUnique({ where: { battleId: id }, select: { id: true, originalBattleId: true } }),
  ]);
  return { ...battle, votes, gifts, tickets, rematch: rematchFrom, rematchOf };
}

export async function closeBattleNow(id: string) {
  const battle = await prisma.battle.findUnique({ where: { id }, select: { status: true } });
  if (!battle) throw errors.notFound('Battle not found');
  if (battle.status !== 'ACTIVE') throw new AppError(409, 'BATTLE_NOT_ACTIVE', 'Only a live battle can be closed');
  await prisma.battle.update({ where: { id }, data: { votingEndsAt: new Date() } });
  await closeBattle(id);
  return adminBattleDetail(id);
}

export async function extendBattle(id: string, hours: number) {
  const battle = await prisma.battle.findUnique({ where: { id }, select: { status: true, votingEndsAt: true } });
  if (!battle) throw errors.notFound('Battle not found');
  if (battle.status !== 'ACTIVE') throw new AppError(409, 'BATTLE_NOT_ACTIVE', 'Only a live battle can be extended');
  await prisma.battle.update({ where: { id }, data: { votingEndsAt: new Date(battle.votingEndsAt.getTime() + hours * 3600 * 1000) } });
  return adminBattleDetail(id);
}

// ───────────── Battle entries (matchmaking tickets) ─────────────

export async function adminListEntries(query: Pagination & { status?: TicketStatus; gameId?: string; q?: string; userId?: string }) {
  const where: Prisma.MatchmakingTicketWhereInput = {
    status: query.status,
    gameId: query.gameId,
    userId: query.userId,
    ...(query.q && { user: { username: { contains: query.q } } }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.matchmakingTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        weaponClass: true,
        rank: true,
        battleId: true,
        createdAt: true,
        matchedAt: true,
        expiresAt: true,
        user: { select: { id: true, username: true } },
        game: { select: { id: true, name: true } },
        clip: { select: { id: true, title: true, thumbnailKey: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.matchmakingTicket.count({ where }),
  ]);
  return paginated(
    items.map(({ clip, ...entry }) => ({ ...entry, clip: { id: clip.id, title: clip.title, thumbnailUrl: storage.url(clip.thumbnailKey) } })),
    total,
    query,
  );
}

export async function adminCancelEntry(id: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM matchmaking_tickets WHERE id = ${id} AND status = 'QUEUED' FOR UPDATE`;
    if (rows.length === 0) throw new AppError(409, 'ENTRY_NOT_WAITING', 'Only a waiting entry can be cancelled');
    const ticket = await tx.matchmakingTicket.update({ where: { id }, data: { status: 'CANCELLED' } });
    await refund(tx, { userId: ticket.userId, type: 'CHALLENGE', reason: 'MATCHMAKING_REFUND', refType: 'ticket', refId: id, note: `Entry cancelled by VALOR: ${reason}`.slice(0, 255) });
    await notify(tx, ticket.userId, 'ENTRY_EXPIRED', {
      title: 'Battle entry cancelled',
      body: 'VALOR cancelled your waiting battle entry. Your Challenge Credit was refunded.',
      data: { entryId: id, clipId: ticket.clipId },
    });
  });
}

// ───────────── Manual match (admin picks the opponent) ─────────────

async function waitingEntry(id: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const ticket = await db.matchmakingTicket.findUnique({ where: { id } });
  if (!ticket) throw errors.notFound('Entry not found');
  if (ticket.status !== 'QUEUED') throw new AppError(409, 'ENTRY_NOT_WAITING', 'This entry is no longer waiting for an opponent');
  return ticket;
}

/**
 * Clips that can be put against a waiting entry: same game, another active player, ready,
 * not in a live battle, and no block between the two players. Clips that are themselves
 * waiting for an opponent are listed first (matching them closes two entries at once).
 */
export async function adminMatchCandidates(entryId: string, q?: string) {
  const ticket = await waitingEntry(entryId);
  const blocked = await blockedUserIds(ticket.userId);
  const clips = await prisma.clip.findMany({
    where: {
      gameId: ticket.gameId,
      status: 'READY',
      userId: { notIn: [ticket.userId, ...blocked] },
      user: { status: 'ACTIVE' },
      battlesAsA: { none: { status: 'ACTIVE' } },
      battlesAsB: { none: { status: 'ACTIVE' } },
      ...(q && { OR: [{ title: { contains: q } }, { user: { username: { contains: q } } }] }),
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true,
      title: true,
      thumbnailKey: true,
      durationSec: true,
      createdAt: true,
      user: { select: { id: true, username: true, avatarUrl: true } },
      tickets: { where: { status: 'QUEUED' }, select: { id: true, weaponClass: true, rank: true }, take: 1 },
    },
  });
  return clips
    .map(({ thumbnailKey, tickets, ...clip }) => ({ ...clip, thumbnailUrl: storage.url(thumbnailKey), waitingEntry: tickets[0] ?? null }))
    .sort((a, b) => Number(Boolean(b.waitingEntry)) - Number(Boolean(a.waitingEntry)));
}

/**
 * Starts the battle with the clip the admin chose. If that clip is waiting in its own entry,
 * the two entries are matched; otherwise it gets an entry with the same criteria, free of charge
 * (VALOR placed it). Both players are notified as in a normal match.
 */
export async function adminMatchEntry(entryId: string, clipId: string) {
  const votingHours = await getSetting('votingDurationHours');
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM matchmaking_tickets WHERE id = ${entryId} AND status = 'QUEUED' FOR UPDATE`;
    if (locked.length === 0) throw new AppError(409, 'ENTRY_NOT_WAITING', 'This entry is no longer waiting for an opponent');
    const ticket = await waitingEntry(entryId, tx);

    await tx.$queryRaw`SELECT id FROM clips WHERE id = ${clipId} FOR UPDATE`;
    const clip = await tx.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true, userId: true, gameId: true, status: true,
        user: { select: { status: true } },
        _count: { select: { battlesAsA: { where: { status: 'ACTIVE' } }, battlesAsB: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!clip || clip.status !== 'READY') throw errors.badRequest('This clip can’t be used in a battle');
    if (clip.userId === ticket.userId) throw errors.badRequest('Pick a clip from another player');
    if (clip.gameId !== ticket.gameId) throw errors.badRequest('The clip must be from the same game');
    if (clip.user.status !== 'ACTIVE') throw errors.badRequest('That player can’t battle right now');
    if (clip._count.battlesAsA + clip._count.battlesAsB > 0) throw new AppError(409, 'CLIP_IN_BATTLE', 'That clip is already in a live battle');
    if (await isBlockedBetween(ticket.userId, clip.userId, tx)) throw errors.badRequest('One of these players blocked the other');

    const theirs = await tx.matchmakingTicket.findFirst({ where: { clipId, status: 'QUEUED' } });
    const opponent =
      theirs ??
      (await tx.matchmakingTicket.create({
        data: { userId: clip.userId, clipId, gameId: ticket.gameId, weaponClass: ticket.weaponClass, rank: ticket.rank },
      }));
    const battle = await startBattle(tx, ticket, opponent, votingHours);
    return { battleId: battle.id, opponentUserId: clip.userId, matchedWaitingEntry: Boolean(theirs) };
  });
}

// ───────────── Rematches ─────────────

export async function adminListRematches(query: Pagination & { status?: RematchStatus; userId?: string }) {
  const where: Prisma.RematchWhereInput = {
    status: query.status,
    ...(query.userId && { OR: [{ challengerId: query.userId }, { opponentId: query.userId }] }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.rematch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        originalBattleId: true,
        battleId: true,
        expiresAt: true,
        respondedAt: true,
        createdAt: true,
        challenger: { select: { id: true, username: true } },
        opponent: { select: { id: true, username: true } },
        originalBattle: { select: { game: { select: { name: true } } } },
      },
      ...toSkipTake(query),
    }),
    prisma.rematch.count({ where }),
  ]);
  return paginated(items, total, query);
}
