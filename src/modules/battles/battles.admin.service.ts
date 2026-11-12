import type { Prisma, RematchStatus, TicketStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { refund } from '../credits/credits.service';
import { notify } from '../notifications/notifications.service';
import { adminGetBattle, closeBattle } from './battles.service';

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
