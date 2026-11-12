import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notify } from '../notifications/notifications.service';

type Tx = Prisma.TransactionClient;

/**
 * Gives a gift's popularity to its recipient. Profile gifts are awarded right away;
 * gifts sent to an anonymous battle clip wait until the battle closes or is cancelled,
 * so the gift can't reveal who made the clip while voting is live.
 */
export async function awardGift(tx: Tx, giftTransactionId: string) {
  const claimed = await tx.giftTransaction.updateMany({
    where: { id: giftTransactionId, awardedAt: null },
    data: { awardedAt: new Date() },
  });
  if (claimed.count === 0) return; // already awarded

  const gift = await tx.giftTransaction.findUniqueOrThrow({
    where: { id: giftTransactionId },
    include: { gift: { select: { name: true, tier: true } }, sender: { select: { username: true } } },
  });

  if (gift.popularityAwarded > 0) {
    await tx.popularityEvent.create({
      data: { userId: gift.recipientId, amount: gift.popularityAwarded, source: 'GIFT', refId: gift.id },
    });
    await tx.user.update({ where: { id: gift.recipientId }, data: { popularity: { increment: gift.popularityAwarded } } });
  }

  const what = gift.quantity > 1 ? `${gift.quantity}× ${gift.gift.name}` : `a ${gift.gift.name}`;
  await notify(tx, gift.recipientId, 'GIFT_RECEIVED', {
    title: 'You received a gift',
    body: `${gift.sender.username} sent you ${what}${gift.battleId ? ' in your battle' : ''} (+${gift.popularityAwarded} popularity).`,
    data: { giftTransactionId: gift.id, battleId: gift.battleId },
  });
}

/** Called when a battle closes or is cancelled. */
export async function awardBattleGifts(tx: Tx, battleId: string) {
  const pending = await tx.giftTransaction.findMany({ where: { battleId, awardedAt: null }, select: { id: true } });
  for (const { id } of pending) await awardGift(tx, id);
}

/** Popularity screen (design 17): total, where it came from, and the gift collection. */
export async function getPopularity(userId: string) {
  const [user, bySource, collection] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { popularity: true } }),
    prisma.popularityEvent.groupBy({ by: ['source'], where: { userId }, _sum: { amount: true } }),
    prisma.giftTransaction.groupBy({ by: ['giftId'], where: { recipientId: userId, awardedAt: { not: null } }, _sum: { quantity: true } }),
  ]);

  const gifts = await prisma.gift.findMany({
    where: { id: { in: collection.map((c) => c.giftId) } },
    select: { id: true, slug: true, name: true, kind: true, tier: true, iconUrl: true },
  });
  const counts = new Map(collection.map((c) => [c.giftId, c._sum.quantity ?? 0]));
  const items = gifts
    .map((gift) => ({ ...gift, count: counts.get(gift.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    popularity: user.popularity,
    sources: Object.fromEntries(bySource.map((s) => [s.source, s._sum.amount ?? 0])),
    collected: items.reduce((sum, item) => sum + item.count, 0),
    collection: items,
  };
}
