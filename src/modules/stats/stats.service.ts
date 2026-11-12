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
