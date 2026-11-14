import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { playerSummarySelect } from '../users/player-select';

/**
 * Leaderboard (design 13): battle wins in the period, ties broken by votes received.
 * Periods are rolling: weekly = last 7 days, monthly = last 30 days.
 * Only completed battles count. Banned players are left out.
 */

export type Period = 'weekly' | 'monthly';

type Row = { userId: string; wins: bigint | number; votes: bigint | number | null; battles: bigint | number };

function periodStart(period: Period) {
  const days = period === 'weekly' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Per-player wins, votes and battles in the period, best first. */
function standingsSql(from: Date, gameId?: string) {
  const game = gameId ? Prisma.sql`AND b.gameId = ${gameId}` : Prisma.empty;
  return Prisma.sql`
    SELECT t.userId, SUM(t.win) AS wins, SUM(t.votes) AS votes, COUNT(*) AS battles
    FROM (
      SELECT c.userId, (b.winnerSide = 'A') AS win, b.votesA AS votes
      FROM battles b JOIN clips c ON c.id = b.clipAId
      WHERE b.status = 'CLOSED' AND b.closedAt >= ${from} ${game}
      UNION ALL
      SELECT c.userId, (b.winnerSide = 'B') AS win, b.votesB AS votes
      FROM battles b JOIN clips c ON c.id = b.clipBId
      WHERE b.status = 'CLOSED' AND b.closedAt >= ${from} ${game}
    ) t
    JOIN users u ON u.id = t.userId AND u.status NOT IN ('BANNED', 'DELETED')
    GROUP BY t.userId`;
}

export async function getLeaderboard(viewerId: string, period: Period, gameId?: string, limit = 50) {
  const from = periodStart(period);
  const standings = standingsSql(from, gameId);

  const top = await prisma.$queryRaw<Row[]>`
    ${standings}
    HAVING wins > 0
    ORDER BY wins DESC, votes DESC, t.userId ASC
    LIMIT ${limit}`;

  const players = await prisma.user.findMany({
    where: { id: { in: [...top.map((r) => r.userId), viewerId] } },
    select: playerSummarySelect,
  });
  const byId = new Map(players.map((p) => [p.id, p]));
  const mainGames = await mainGameByPlayer([...top.map((r) => r.userId), viewerId], from);

  const items = top.map((row, index) => ({
    rank: index + 1,
    player: byId.get(row.userId)!,
    mainGame: mainGames.get(row.userId) ?? null,
    wins: Number(row.wins),
    votes: Number(row.votes ?? 0),
    battles: Number(row.battles),
  }));

  // The viewer's own row (design shows "14 · Nyx_07 · You" under the list).
  let me = items.find((item) => item.player.id === viewerId) ?? null;
  if (!me) {
    const mine = await prisma.$queryRaw<Row[]>`SELECT * FROM (${standings}) s WHERE s.userId = ${viewerId}`;
    if (mine.length > 0 && Number(mine[0].wins) > 0) {
      const wins = Number(mine[0].wins);
      const votes = Number(mine[0].votes ?? 0);
      const ahead = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM (${standings}) s
        WHERE s.wins > ${wins} OR (s.wins = ${wins} AND s.votes > ${votes})`;
      me = { rank: Number(ahead[0].n) + 1, player: byId.get(viewerId)!, mainGame: mainGames.get(viewerId) ?? null, wins, votes, battles: Number(mine[0].battles) };
    }
  }

  return { period, from, gameId: gameId ?? null, items, me };
}

/** The game each player battled in most during the period (design 13 shows it under the name). */
async function mainGameByPlayer(userIds: string[], from: Date) {
  const result = new Map<string, { id: string; name: string }>();
  if (userIds.length === 0) return result;
  const rows = await prisma.$queryRaw<{ userId: string; gameId: string; name: string; n: bigint | number }[]>`
    SELECT c.userId, g.id AS gameId, g.name, COUNT(*) AS n
    FROM battles b
    JOIN clips c ON c.id = b.clipAId OR c.id = b.clipBId
    JOIN games g ON g.id = b.gameId
    WHERE b.status = 'CLOSED' AND b.closedAt >= ${from} AND c.userId IN (${Prisma.join(userIds)})
    GROUP BY c.userId, g.id, g.name
    ORDER BY n DESC, g.name ASC`;
  for (const row of rows) {
    if (!result.has(row.userId)) result.set(row.userId, { id: row.gameId, name: row.name });
  }
  return result;
}
