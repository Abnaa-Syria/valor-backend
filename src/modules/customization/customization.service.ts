import { Prisma, type CosmeticItem, type CosmeticKind } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, errors } from '../../utils/app-error';
import { cornerStyle } from './cosmetic-metadata';

/**
 * Customization Studio (design 29–35).
 * - FRAME: ring artwork around the avatar (assetUrl + metadata.layout / glowColor).
 * - THEME: app-wide color tokens (metadata.tokens), see cosmetic-metadata.ts.
 * - AVATAR: ready-made profile pictures; applying one sets the player's avatar.
 * Free items apply without buying (claimed on first use); paid ones are bought through
 * POST /v1/store/purchases. Items missing their artwork / colors are not shown.
 */

const itemSelect = {
  id: true,
  kind: true,
  slug: true,
  name: true,
  isFree: true,
  isDefault: true,
  priceSar: true,
  assetUrl: true,
  metadata: true,
  storeProductId: true,
} satisfies Prisma.CosmeticItemSelect;

type Item = Pick<CosmeticItem, keyof typeof itemSelect>;

/** Items the app can actually draw. */
export const readyWhere: Prisma.CosmeticItemWhereInput = {
  isActive: true,
  OR: [
    { kind: 'THEME', metadata: { not: Prisma.AnyNull } },
    { kind: 'FRAME', assetUrl: { not: null } },
    { kind: 'AVATAR', assetUrl: { not: null } },
  ],
};

/** Theme extras the preview screens show: 6 palette swatches and the corner style. */
function themeExtras(item: Item) {
  if (item.kind !== 'THEME' || !item.metadata || typeof item.metadata !== 'object') return {};
  const tokens = (item.metadata as { tokens?: Record<string, string | number> }).tokens ?? {};
  return {
    palette: ['bg', 'surface', 'surface-raised', 'accent', 'accent-secondary', 'text-primary'].map((key) => tokens[key]),
    corners: cornerStyle(tokens),
  };
}

export async function listCosmetics(userId: string, kind?: CosmeticKind) {
  const [items, owned, user] = await Promise.all([
    prisma.cosmeticItem.findMany({
      where: { ...readyWhere, kind },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
      select: itemSelect,
    }),
    prisma.userCosmetic.findMany({ where: { userId }, select: { itemId: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { activeFrameId: true, activeThemeId: true, avatarUrl: true } }),
  ]);
  const ownedIds = new Set(owned.map((o) => o.itemId));

  return items.map((item) => {
    const isOwned = item.isFree || ownedIds.has(item.id);
    const active =
      item.kind === 'AVATAR' ? item.assetUrl === user.avatarUrl : item.id === user.activeFrameId || item.id === user.activeThemeId;
    return {
      ...item,
      ...themeExtras(item),
      owned: isOwned,
      active,
      purchasable: !isOwned && item.priceSar !== null && item.storeProductId !== null,
      pricePending: !item.isFree && item.priceSar === null,
    };
  });
}

export async function applyCosmetic(userId: string, itemId: string) {
  const item = await prisma.cosmeticItem.findFirst({ where: { id: itemId, ...readyWhere } });
  if (!item) throw errors.notFound('Item not found');

  const owned = await prisma.userCosmetic.count({ where: { userId, itemId } });
  if (!owned && !item.isFree) throw new AppError(403, 'NOT_OWNED', 'Buy this item before applying it');

  await prisma.$transaction(async (tx) => {
    if (!owned) await tx.userCosmetic.createMany({ data: [{ userId, itemId }], skipDuplicates: true });
    const data =
      item.kind === 'FRAME' ? { activeFrameId: item.id } : item.kind === 'THEME' ? { activeThemeId: item.id } : { avatarUrl: item.assetUrl };
    await tx.user.update({ where: { id: userId }, data });
  });
  return listCosmetics(userId, item.kind);
}

/** Public: what the app needs before login (splash, onboarding, auth screens use the default theme). */
export async function getAppConfig() {
  const theme = await prisma.cosmeticItem.findFirst({
    where: { kind: 'THEME', isDefault: true, ...readyWhere },
    select: itemSelect,
  });
  return {
    defaultTheme: theme ? { id: theme.id, slug: theme.slug, name: theme.name, ...(theme.metadata as object), ...themeExtras(theme) } : null,
  };
}
