import { z } from 'zod';
import { CosmeticKind, CreditType, GiftKind, GiftTier, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/app-error';
import { parseCosmeticMetadata, themeTokenGroups } from '../customization/cosmetic-metadata';

/** An item shown in the app must have what the app needs to draw it. */
function assertReadyToShow(kind: string, isActive: boolean, assetUrl: string | null, design: unknown) {
  if (!isActive) return;
  if ((kind === 'FRAME' || kind === 'AVATAR') && !assetUrl) {
    throw new AppError(400, 'ARTWORK_REQUIRED', 'Upload the artwork before making this visible in the app');
  }
  if ((kind === 'THEME' || kind === 'FRAME') && !design) {
    throw new AppError(400, 'DESIGN_REQUIRED', `Set the ${kind === 'THEME' ? 'theme colors' : 'frame glow and layout'} before making this visible`);
  }
}

/** Only one default frame, theme and avatar: the one new players get and login screens use. */
async function keepSingleDefault(tx: Prisma.TransactionClient, id: string, kind: CosmeticKind) {
  await tx.cosmeticItem.updateMany({ where: { kind, isDefault: true, id: { not: id } }, data: { isDefault: false } });
}

/** Token definitions for the dashboard's theme editor. */
export const getThemeTokenGroups = () => themeTokenGroups;

/**
 * The catalog: credit packs, gifts, frames and themes.
 * Everything is editable from the dashboard. An item with no price is shown as
 * "price pending" in the app and can't be bought.
 */

// Prices in SAR, kept to 2 decimals.
const money = z.coerce.number().min(0).max(10000).transform((value) => Math.round(value * 100) / 100);
const productId = z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dots, dashes, underscores');
const slug = z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes');

export const packInputSchema = z.object({
  type: z.enum(CreditType),
  credits: z.number().int().min(1).max(10000),
  priceSar: money,
  storeProductId: productId,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const giftInputSchema = z.object({
  slug,
  name: z.string().trim().min(1).max(60),
  kind: z.enum(GiftKind),
  tier: z.enum(GiftTier),
  priceSar: money.nullable(),
  popularityValue: z.number().int().min(0).max(100000).nullable(),
  iconUrl: z.url().max(500).nullish(),
  storeProductId: productId.nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const cosmeticInputSchema = z.object({
  kind: z.enum(CosmeticKind),
  slug,
  name: z.string().trim().min(1).max(60),
  isFree: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  priceSar: money.nullable(),
  assetUrl: z.url().max(500).nullish(),
  metadata: z.unknown().optional(), // validated per kind (theme tokens / frame layout)
  storeProductId: productId.nullish(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

const order = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

// ───────────── Mobile ─────────────

export async function getCreditPacks() {
  const packs = await prisma.creditPack.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    select: { id: true, type: true, credits: true, priceSar: true, storeProductId: true },
  });
  return { voting: packs.filter((p) => p.type === 'VOTING'), challenge: packs.filter((p) => p.type === 'CHALLENGE') };
}

/** Gift catalog grouped by tier (design 24: Entry / Standard / Mid / Advanced / Legendary). */
export async function getGiftCatalog() {
  const gifts = await prisma.gift.findMany({
    where: { isActive: true },
    orderBy: order,
    select: { id: true, slug: true, name: true, kind: true, tier: true, priceSar: true, popularityValue: true, iconUrl: true, storeProductId: true },
  });
  return Object.values(GiftTier).map((tier) => ({
    tier,
    items: gifts
      .filter((g) => g.tier === tier)
      .map((g) => ({ ...g, available: g.priceSar !== null && g.popularityValue !== null && g.storeProductId !== null })),
  }));
}

// ───────────── Dashboard ─────────────

export const adminCatalog = {
  listPacks: () => prisma.creditPack.findMany({ orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }] }),
  createPack: (input: z.infer<typeof packInputSchema>) => prisma.creditPack.create({ data: input }),
  updatePack: (id: string, input: Partial<z.infer<typeof packInputSchema>>) => prisma.creditPack.update({ where: { id }, data: input }),

  getPack: async (id: string) => {
    const pack = await prisma.creditPack.findUnique({ where: { id } });
    if (!pack) throw new AppError(404, 'NOT_FOUND', 'Credit pack not found');
    const sold = await prisma.purchase.count({ where: { storeProductId: pack.storeProductId, status: 'COMPLETED' } });
    return { ...pack, sold };
  },
  deletePack: async (id: string) => {
    const pack = await prisma.creditPack.findUniqueOrThrow({ where: { id } });
    const sold = await prisma.purchase.count({ where: { storeProductId: pack.storeProductId } });
    if (sold) throw new AppError(409, 'IN_USE', 'This pack has purchases — hide it instead of deleting');
    await prisma.creditPack.delete({ where: { id } });
    return pack;
  },

  listGifts: () => prisma.gift.findMany({ orderBy: [{ tier: 'asc' }, ...order] }),
  getGift: async (id: string) => {
    const gift = await prisma.gift.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
    if (!gift) throw new AppError(404, 'NOT_FOUND', 'Gift not found');
    return gift;
  },
  deleteGift: async (id: string) => {
    const gift = await prisma.gift.findUniqueOrThrow({ where: { id }, include: { _count: { select: { transactions: true } } } });
    if (gift._count.transactions) throw new AppError(409, 'IN_USE', 'This gift has been sent — hide it instead of deleting');
    await prisma.gift.delete({ where: { id } });
    return gift;
  },
  createGift: (input: z.infer<typeof giftInputSchema>) => prisma.gift.create({ data: input }),
  updateGift: (id: string, input: Partial<z.infer<typeof giftInputSchema>>) => prisma.gift.update({ where: { id }, data: input }),

  listCosmetics: () =>
    prisma.cosmeticItem.findMany({ orderBy: [{ kind: 'asc' }, ...order], include: { _count: { select: { owners: true } } } }),
  getCosmetic: async (id: string) => {
    const item = await prisma.cosmeticItem.findUnique({ where: { id }, include: { _count: { select: { owners: true } } } });
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Item not found');
    return item;
  },
  deleteCosmetic: async (id: string) => {
    const item = await prisma.cosmeticItem.findUniqueOrThrow({ where: { id }, include: { _count: { select: { owners: true } } } });
    if (item._count.owners) throw new AppError(409, 'IN_USE', 'Players own this item — hide it instead of deleting');
    if (item.isDefault) throw new AppError(409, 'IS_DEFAULT', 'Choose another default before deleting this one');
    await prisma.cosmeticItem.delete({ where: { id } });
    return item;
  },
  createCosmetic: async ({ metadata, ...input }: z.infer<typeof cosmeticInputSchema>) => {
    const design = metadata === undefined || metadata === null ? null : parseCosmeticMetadata(input.kind, metadata);
    assertReadyToShow(input.kind, input.isActive, input.assetUrl ?? null, design);
    return prisma.$transaction(async (tx) => {
      const created = await tx.cosmeticItem.create({ data: { ...input, metadata: (design ?? undefined) as Prisma.InputJsonValue | undefined } });
      if (created.isDefault) await keepSingleDefault(tx, created.id, created.kind);
      return created;
    });
  },
  updateCosmetic: async (id: string, { metadata, ...input }: Partial<z.infer<typeof cosmeticInputSchema>>) => {
    const current = await prisma.cosmeticItem.findUniqueOrThrow({ where: { id } });
    const kind = input.kind ?? current.kind;
    const design =
      metadata === undefined ? current.metadata : metadata === null ? null : parseCosmeticMetadata(kind, metadata);
    assertReadyToShow(kind, input.isActive ?? current.isActive, input.assetUrl !== undefined ? input.assetUrl : current.assetUrl, design);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.cosmeticItem.update({
        where: { id },
        data: {
          ...input,
          ...(metadata !== undefined && { metadata: metadata === null ? Prisma.DbNull : (design as Prisma.InputJsonValue) }),
        },
      });
      if (updated.isDefault) await keepSingleDefault(tx, updated.id, updated.kind);
      return updated;
    });
  },
};
