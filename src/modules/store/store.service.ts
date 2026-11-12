import { z } from 'zod';
import { BattleSide, Prisma, StoreProvider, type PurchaseKind, type PurchaseStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { verifyStorePurchase } from '../../lib/payments';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { adjustPurchased, getWallet } from '../credits/credits.service';
import { awardGift } from '../gifts/popularity.service';
import { getCreditPacks } from './catalog.service';
import { isBlockedBetween } from '../blocks/blocks.service';

/**
 * One endpoint for every store purchase (credit packs, gifts, frames, themes):
 *   1. find the product by its store product id and check it can be bought
 *   2. check the gift target / that a cosmetic isn't owned yet — before touching the payment
 *   3. verify the transaction with the store
 *   4. record the purchase and deliver it in one transaction
 * The same store transaction can't be delivered twice (unique storeTransactionId).
 * If delivery fails after a verified payment, the purchase is saved as FAILED for support.
 */

export const purchaseSchema = z.object({
  provider: z.enum(StoreProvider),
  productId: z.string().trim().min(1).max(100),
  transactionId: z.string().trim().min(1).max(150),
  receipt: z.string().max(20000).optional(),
  quantity: z.number().int().min(1).max(99).default(1),
  gift: z
    .union([
      z.object({ recipientId: z.string().min(1).max(30) }),
      z.object({ battleId: z.string().min(1).max(30), side: z.enum(BattleSide) }),
    ])
    .optional(),
});

type PurchaseInput = z.infer<typeof purchaseSchema>;
type Tx = Prisma.TransactionClient;

type Product =
  | { kind: 'CREDIT_PACK'; id: string; unitPrice: Prisma.Decimal; pack: { type: 'VOTING' | 'CHALLENGE'; credits: number } }
  | { kind: 'GIFT'; id: string; unitPrice: Prisma.Decimal; gift: { name: string; popularityValue: number } }
  | { kind: 'COSMETIC'; id: string; unitPrice: Prisma.Decimal; cosmetic: { name: string; kind: 'FRAME' | 'THEME' | 'AVATAR' } };

async function findProduct(productId: string): Promise<Product> {
  const [pack, gift, cosmetic] = await Promise.all([
    prisma.creditPack.findUnique({ where: { storeProductId: productId } }),
    prisma.gift.findUnique({ where: { storeProductId: productId } }),
    prisma.cosmeticItem.findUnique({ where: { storeProductId: productId } }),
  ]);
  if (pack?.isActive) return { kind: 'CREDIT_PACK', id: pack.id, unitPrice: pack.priceSar, pack };
  if (gift?.isActive && gift.priceSar !== null && gift.popularityValue !== null) {
    return { kind: 'GIFT', id: gift.id, unitPrice: gift.priceSar, gift: { name: gift.name, popularityValue: gift.popularityValue } };
  }
  if (cosmetic?.isActive && !cosmetic.isFree && cosmetic.priceSar !== null) {
    return { kind: 'COSMETIC', id: cosmetic.id, unitPrice: cosmetic.priceSar, cosmetic };
  }
  throw new AppError(404, 'PRODUCT_NOT_AVAILABLE', 'This product is not available');
}

type GiftTarget = { recipientId: string; battleId: string | null; battleSide: BattleSide | null; clipId: string | null };

async function resolveGiftTarget(senderId: string, gift: PurchaseInput['gift']): Promise<GiftTarget> {
  if (!gift) throw errors.badRequest('Choose who receives the gift');

  if ('recipientId' in gift) {
    if (gift.recipientId === senderId) throw errors.badRequest("You can't send a gift to yourself");
    const recipient = await prisma.user.findUnique({ where: { id: gift.recipientId }, select: { status: true } });
    if (!recipient || recipient.status === 'BANNED' || recipient.status === 'DELETED') throw errors.notFound('Player not found');
    if (await isBlockedBetween(senderId, gift.recipientId)) throw errors.notFound('Player not found');
    return { recipientId: gift.recipientId, battleId: null, battleSide: null, clipId: null };
  }

  // Gift to an anonymous clip in a live battle (design 24b / 24c).
  const battle = await prisma.battle.findUnique({
    where: { id: gift.battleId },
    select: { status: true, votingEndsAt: true, clipA: { select: { id: true, userId: true } }, clipB: { select: { id: true, userId: true } } },
  });
  if (!battle) throw errors.notFound('Battle not found');
  if (battle.status !== 'ACTIVE' || battle.votingEndsAt <= new Date()) {
    throw new AppError(409, 'VOTING_CLOSED', 'This battle has ended');
  }
  if (battle.clipA.userId === senderId || battle.clipB.userId === senderId) {
    throw new AppError(403, 'OWN_BATTLE', "You can't send gifts in your own battle");
  }
  const clip = gift.side === 'A' ? battle.clipA : battle.clipB;
  return { recipientId: clip.userId, battleId: gift.battleId, battleSide: gift.side, clipId: clip.id };
}

async function deliver(tx: Tx, userId: string, purchaseId: string, product: Product, quantity: number, target: GiftTarget | null) {
  switch (product.kind) {
    case 'CREDIT_PACK':
      return {
        wallet: await adjustPurchased(tx, {
          userId,
          type: product.pack.type,
          amount: product.pack.credits * quantity,
          reason: 'PURCHASE',
          refType: 'purchase',
          refId: purchaseId,
        }),
      };

    case 'GIFT': {
      const giftTx = await tx.giftTransaction.create({
        data: {
          giftId: product.id,
          senderId: userId,
          recipientId: target!.recipientId,
          battleId: target!.battleId,
          battleSide: target!.battleSide,
          clipId: target!.clipId,
          purchaseId,
          quantity,
          unitPriceSar: product.unitPrice,
          popularityAwarded: product.gift.popularityValue * quantity,
        },
      });
      // Profile gifts land now; battle gifts when the battle ends (keeps the battle anonymous).
      if (!giftTx.battleId) await awardGift(tx, giftTx.id);
      // Design 27: "Kairo's popularity 9,860 → 9,861" (profile gifts only; battle gifts stay anonymous).
      const after = giftTx.battleId
        ? null
        : (await tx.user.findUniqueOrThrow({ where: { id: giftTx.recipientId }, select: { popularity: true } })).popularity;
      return {
        gift: {
          id: giftTx.id,
          name: product.gift.name,
          quantity,
          popularity: giftTx.popularityAwarded,
          deliversWhenBattleEnds: Boolean(giftTx.battleId),
          recipientPopularity: after === null ? null : { before: after - giftTx.popularityAwarded, after },
        },
      };
    }

    case 'COSMETIC':
      await tx.userCosmetic.create({ data: { userId, itemId: product.id, purchaseId } });
      return { item: { id: product.id, name: product.cosmetic.name, kind: product.cosmetic.kind } };
  }
}

export async function purchase(userId: string, input: PurchaseInput) {
  const product = await findProduct(input.productId);
  const quantity = product.kind === 'GIFT' ? input.quantity : 1;

  // Checks that don't need the payment come first.
  const target = product.kind === 'GIFT' ? await resolveGiftTarget(userId, input.gift) : null;
  if (product.kind === 'COSMETIC') {
    const owned = await prisma.userCosmetic.count({ where: { userId, itemId: product.id } });
    if (owned) throw new AppError(409, 'ALREADY_OWNED', 'You already own this item');
  }

  const verified = await verifyStorePurchase(input);
  if (verified.productId !== input.productId) throw new AppError(400, 'PRODUCT_MISMATCH', 'Receipt is for a different product');

  // Same store transaction sent again (app retry): return what was already delivered.
  const existing = await prisma.purchase.findUnique({ where: { storeTransactionId: verified.storeTransactionId } });
  if (existing) {
    if (existing.userId !== userId) throw new AppError(409, 'TRANSACTION_USED', 'This transaction belongs to another account');
    if (existing.status === 'COMPLETED') return { purchase: existing, alreadyDelivered: true };
  }

  const priceSar = product.unitPrice.mul(quantity);
  const base = {
    userId,
    provider: input.provider,
    storeTransactionId: verified.storeTransactionId,
    storeProductId: input.productId,
    kind: product.kind as PurchaseKind,
    refId: product.id,
    quantity,
    priceSar,
    rawPayload: input.receipt ? ({ receipt: input.receipt.slice(0, 5000) } as Prisma.InputJsonValue) : undefined,
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.purchase.update({ where: { id: existing.id }, data: { status: 'COMPLETED' } })
        : await tx.purchase.create({ data: { ...base, status: 'COMPLETED' } });
      const delivered = await deliver(tx, userId, record.id, product, quantity, target);
      return { purchase: record, alreadyDelivered: false, ...delivered };
    });
  } catch (err) {
    // Paid but not delivered (e.g. the battle ended a second ago): keep a record for support.
    if (!existing) {
      await prisma.purchase
        .create({ data: { ...base, status: 'FAILED' } })
        .catch((e: unknown) => logger.error({ e }, 'Could not record failed purchase'));
    }
    logger.warn({ err, userId, productId: input.productId }, 'Verified purchase could not be delivered');
    throw err;
  }
}

const purchaseSelect = {
  id: true,
  provider: true,
  storeProductId: true,
  kind: true,
  refId: true,
  quantity: true,
  priceSar: true,
  status: true,
  createdAt: true,
} satisfies Prisma.PurchaseSelect;

export async function listMyPurchases(userId: string, query: Pagination) {
  const [items, total] = await prisma.$transaction([
    prisma.purchase.findMany({ where: { userId }, select: purchaseSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.purchase.count({ where: { userId } }),
  ]);
  return paginated(items, total, query);
}

export async function getStoreFront(userId: string) {
  const [packs, wallet] = await Promise.all([getCreditPacks(), getWallet(userId)]);
  return { wallet, packs };
}

// ───────────── Dashboard ─────────────

export async function adminListPurchases(query: Pagination & { status?: PurchaseStatus; kind?: PurchaseKind; q?: string }) {
  const where: Prisma.PurchaseWhereInput = {
    status: query.status,
    kind: query.kind,
    ...(query.q && {
      OR: [{ storeTransactionId: { contains: query.q } }, { storeProductId: { contains: query.q } }, { user: { username: { contains: query.q } } }],
    }),
  };
  const [items, total, revenue] = await prisma.$transaction([
    prisma.purchase.findMany({
      where,
      select: { ...purchaseSelect, storeTransactionId: true, user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { priceSar: true } }),
  ]);
  return { totalRevenueSar: revenue._sum.priceSar?.toFixed(2) ?? '0.00', ...paginated(items, total, query) };
}
