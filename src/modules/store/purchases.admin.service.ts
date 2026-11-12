import { prisma } from '../../lib/prisma';
import { AppError, errors } from '../../utils/app-error';

/**
 * Dashboard: purchase record and refunds.
 *
 * Refunding money happens in App Store Connect / Google Play; this marks the purchase REFUNDED
 * and takes back what was delivered, as far as possible:
 * - credit pack → removes the purchased credits (only what's still in the wallet; the shortfall is reported)
 * - frame / theme / avatar → removes ownership (and switches the player back to the default)
 * - gift → takes back the popularity, or cancels it if it wasn't delivered yet (battle gift)
 */

export async function adminGetPurchase(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, email: true } },
      gifts: {
        select: {
          id: true,
          quantity: true,
          popularityAwarded: true,
          awardedAt: true,
          battleId: true,
          battleSide: true,
          gift: { select: { name: true, tier: true } },
          recipient: { select: { id: true, username: true } },
        },
      },
      items: { select: { acquiredAt: true, item: { select: { id: true, name: true, kind: true } } } },
    },
  });
  if (!purchase) throw errors.notFound('Purchase not found');
  const ledger = await prisma.creditLedgerEntry.findMany({
    where: { userId: purchase.userId, refType: 'purchase', refId: id },
    orderBy: { createdAt: 'asc' },
  });
  return { ...purchase, ledger };
}

export async function refundPurchase(id: string, reason: string) {
  const note = `Refund: ${reason}`.slice(0, 255);
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM purchases WHERE id = ${id} FOR UPDATE`;
    const purchase = await tx.purchase.findUnique({ where: { id }, include: { gifts: true, items: true } });
    if (!purchase) throw errors.notFound('Purchase not found');
    if (purchase.status !== 'COMPLETED') throw new AppError(409, 'NOT_REFUNDABLE', 'Only a completed purchase can be refunded');

    let summary = '';
    if (purchase.kind === 'CREDIT_PACK') {
      const given = await tx.creditLedgerEntry.findMany({ where: { userId: purchase.userId, refType: 'purchase', refId: id } });
      for (const entry of given) {
        await tx.creditBalance.upsert({
          where: { userId_type: { userId: purchase.userId, type: entry.type } },
          create: { userId: purchase.userId, type: entry.type },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM credit_balances WHERE userId = ${purchase.userId} AND type = ${entry.type} FOR UPDATE`;
        const balance = await tx.creditBalance.findUniqueOrThrow({ where: { userId_type: { userId: purchase.userId, type: entry.type } } });
        const takeBack = Math.min(entry.amount, balance.purchasedBalance);
        if (takeBack > 0) {
          await tx.creditLedgerEntry.create({
            data: { userId: purchase.userId, type: entry.type, source: 'PURCHASED', amount: -takeBack, reason: 'ADMIN_ADJUSTMENT', refType: 'purchase', refId: id, note },
          });
          await tx.creditBalance.update({ where: { id: balance.id }, data: { purchasedBalance: { decrement: takeBack } } });
        }
        summary = `Removed ${takeBack} of ${entry.amount} ${entry.type.toLowerCase()} credits${takeBack < entry.amount ? ` (${entry.amount - takeBack} already spent)` : ''}`;
      }
    }

    if (purchase.kind === 'COSMETIC') {
      for (const owned of purchase.items) {
        await tx.userCosmetic.delete({ where: { userId_itemId: { userId: owned.userId, itemId: owned.itemId } } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: owned.userId }, select: { activeFrameId: true, activeThemeId: true } });
        if (user.activeFrameId === owned.itemId || user.activeThemeId === owned.itemId) {
          const item = await tx.cosmeticItem.findUniqueOrThrow({ where: { id: owned.itemId }, select: { kind: true } });
          const fallback = await tx.cosmeticItem.findFirst({ where: { kind: item.kind, isDefault: true }, select: { id: true } });
          await tx.user.update({
            where: { id: owned.userId },
            data: item.kind === 'FRAME' ? { activeFrameId: fallback?.id ?? null } : { activeThemeId: fallback?.id ?? null },
          });
        }
      }
      summary = 'Removed the item from the player';
    }

    if (purchase.kind === 'GIFT') {
      for (const gift of purchase.gifts) {
        if (gift.awardedAt && gift.popularityAwarded > 0) {
          await tx.popularityEvent.create({ data: { userId: gift.recipientId, amount: -gift.popularityAwarded, source: 'ADMIN_ADJUSTMENT', refId: gift.id } });
          await tx.user.update({ where: { id: gift.recipientId }, data: { popularity: { decrement: gift.popularityAwarded } } });
          summary = `Took back ${gift.popularityAwarded} popularity`;
        } else {
          // Not delivered yet (battle still live): cancel it so it's never delivered.
          await tx.giftTransaction.update({ where: { id: gift.id }, data: { popularityAwarded: 0, awardedAt: new Date() } });
          summary = 'Cancelled the gift before delivery';
        }
      }
    }

    await tx.purchase.update({ where: { id }, data: { status: 'REFUNDED' } });
    return summary;
  });
  return { purchase: await adminGetPurchase(id), outcome };
}
