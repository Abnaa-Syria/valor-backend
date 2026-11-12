import { prisma } from '../../lib/prisma';

export async function getOverview() {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    usersNew24h,
    clipsTotal,
    battlesActive,
    battlesClosed,
    entriesWaiting,
    votes24h,
    openReports,
    revenueTotal,
    revenue30d,
    purchases30d,
    gifts30d,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since24h } } }),
    prisma.clip.count({ where: { status: 'READY' } }),
    prisma.battle.count({ where: { status: 'ACTIVE' } }),
    prisma.battle.count({ where: { status: 'CLOSED' } }),
    prisma.matchmakingTicket.count({ where: { status: 'QUEUED' } }),
    prisma.vote.count({ where: { createdAt: { gte: since24h } } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.purchase.aggregate({ where: { status: 'COMPLETED', provider: { not: 'TEST' } }, _sum: { priceSar: true } }),
    prisma.purchase.aggregate({ where: { status: 'COMPLETED', provider: { not: 'TEST' }, createdAt: { gte: since30d } }, _sum: { priceSar: true } }),
    prisma.purchase.count({ where: { status: 'COMPLETED', createdAt: { gte: since30d } } }),
    prisma.giftTransaction.aggregate({ where: { createdAt: { gte: since30d } }, _sum: { quantity: true } }),
  ]);

  return {
    users: { total: usersTotal, new24h: usersNew24h },
    clips: { total: clipsTotal },
    battles: { active: battlesActive, closed: battlesClosed, entriesWaiting },
    votes: { last24h: votes24h },
    reports: { open: openReports },
    // Real money only: TEST purchases (development) are left out of revenue.
    revenue: {
      totalSar: revenueTotal._sum.priceSar?.toFixed(2) ?? '0.00',
      last30dSar: revenue30d._sum.priceSar?.toFixed(2) ?? '0.00',
    },
    store: { purchases30d, giftsSent30d: gifts30d._sum.quantity ?? 0 },
  };
}

type DayRow = { day: string; value: bigint | number | string | null };

/** Daily numbers for the last `days` days (UTC dates), for the overview charts. */
export async function getTimeseries(days: number) {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const [players, clips, battles, votes, revenue] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`SELECT DATE(createdAt) AS day, COUNT(*) AS value FROM users WHERE createdAt >= ${from} GROUP BY DATE(createdAt)`,
    prisma.$queryRaw<DayRow[]>`SELECT DATE(createdAt) AS day, COUNT(*) AS value FROM clips WHERE createdAt >= ${from} GROUP BY DATE(createdAt)`,
    prisma.$queryRaw<DayRow[]>`SELECT DATE(closedAt) AS day, COUNT(*) AS value FROM battles WHERE status = 'CLOSED' AND closedAt >= ${from} GROUP BY DATE(closedAt)`,
    prisma.$queryRaw<DayRow[]>`SELECT DATE(createdAt) AS day, COUNT(*) AS value FROM votes WHERE createdAt >= ${from} GROUP BY DATE(createdAt)`,
    prisma.$queryRaw<DayRow[]>`SELECT DATE(createdAt) AS day, SUM(priceSar) AS value FROM purchases WHERE status = 'COMPLETED' AND provider <> 'TEST' AND createdAt >= ${from} GROUP BY DATE(createdAt)`,
  ]);

  const key = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
  const toMap = (rows: DayRow[]) => new Map(rows.map((row) => [key(row.day), Number(row.value ?? 0)]));
  const maps = { players: toMap(players), clips: toMap(clips), battles: toMap(battles), votes: toMap(votes), revenue: toMap(revenue) };

  const series = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(from.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    series.push({
      date,
      newPlayers: maps.players.get(date) ?? 0,
      clips: maps.clips.get(date) ?? 0,
      battlesCompleted: maps.battles.get(date) ?? 0,
      votes: maps.votes.get(date) ?? 0,
      revenueSar: Math.round((maps.revenue.get(date) ?? 0) * 100) / 100,
    });
  }
  return series;
}
