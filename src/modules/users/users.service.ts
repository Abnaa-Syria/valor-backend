import type { CreditType, Prisma, UserStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake } from '../../utils/pagination';
import { getBattleStats } from '../battles/battles.service';
import { adjustPurchased } from '../credits/credits.service';
import { storage } from '../../lib/storage';
import { env } from '../../config/env';
import { isBlockedBetween } from '../blocks/blocks.service';
import { getSetting } from '../settings/settings.service';
import { IMAGES_PREFIX } from './image-upload';
import type { ListUsersQuery } from './users.schemas';

const cosmeticSelect = { id: true, slug: true, name: true, kind: true, assetUrl: true, metadata: true } as const;

// ───────────── Mobile ─────────────

/** Games the player has published clips in (profile subtitle, e.g. "Neon Siege · Iron Dusk"). */
async function playedGames(userId: string) {
  const rows = await prisma.clip.findMany({
    where: { userId, status: { not: 'REMOVED' } },
    distinct: ['gameId'],
    select: { game: { select: { id: true, name: true } } },
  });
  return rows.map((row) => row.game);
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      avatarUrl: true,
      bannerUrl: true,
      popularity: true,
      referralCode: true,
      hideReferralCount: true,
      createdAt: true,
      activeFrame: { select: cosmeticSelect },
      activeTheme: { select: cosmeticSelect },
      _count: { select: { giftsReceived: true, referralsMade: true } },
    },
  });
  const { _count, ...profile } = user;
  const [battles, games, referralPoints, referralEarned] = await Promise.all([
    getBattleStats(userId),
    playedGames(userId),
    getSetting('referralPopularityPoints'),
    prisma.popularityEvent.aggregate({ where: { userId, source: 'REFERRAL' }, _sum: { amount: true } }),
  ]);
  return {
    ...profile,
    inviteUrl: `${env.INVITE_BASE_URL.replace(/\/$/, '')}/${profile.referralCode}`,
    // Invite friends screen (design 18): points per friend now, and points earned so far.
    referralPoints,
    referralPointsEarned: referralEarned._sum.amount ?? 0,
    games,
    battles,
    giftsReceived: _count.giftsReceived,
    friendsJoined: _count.referralsMade,
  };
}

export async function updateMe(userId: string, input: { username?: string; hideReferralCount?: boolean }) {
  if (input.username) {
    const taken = await prisma.user.findFirst({ where: { username: input.username, id: { not: userId } }, select: { id: true } });
    if (taken) throw errors.conflict('This username is taken');
  }
  await prisma.user.update({ where: { id: userId }, data: input });
  return getMe(userId);
}

/** Saves an uploaded avatar or banner and deletes the previous file. */
export async function setProfileImage(userId: string, field: 'avatar' | 'banner', fileName: string | undefined) {
  if (!fileName) throw errors.badRequest('Send an image in the "image" field');
  const url = storage.url(storage.keyFor(IMAGES_PREFIX, fileName))!;
  const column = field === 'avatar' ? 'avatarUrl' : 'bannerUrl';

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true, bannerUrl: true } });
  await prisma.user.update({ where: { id: userId }, data: { [column]: url } });
  await storage.remove(storage.keyFromUrl(before[column]));
  return getMe(userId);
}

/** What other players see. Gift count stays hidden (design 16); referral count follows the player's setting. */
export async function getPublicProfile(viewerId: string, playerId: string) {
  if (await isBlockedBetween(viewerId, playerId)) throw errors.notFound('Player not found');
  const user = await prisma.user.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      bannerUrl: true,
      popularity: true,
      status: true,
      hideReferralCount: true,
      createdAt: true,
      activeFrame: { select: cosmeticSelect },
      _count: { select: { referralsMade: true } },
    },
  });
  if (!user || user.status === 'BANNED' || user.status === 'DELETED') throw errors.notFound('Player not found');

  const [battles, games] = await Promise.all([getBattleStats(playerId), playedGames(playerId)]);
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    popularity: user.popularity,
    createdAt: user.createdAt,
    activeFrame: user.activeFrame,
    games,
    battles,
    friendsJoined: user.hideReferralCount ? null : user._count.referralsMade,
  };
}

// ───────────── Dashboard ─────────────

const listSelect = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  status: true,
  popularity: true,
  createdAt: true,
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

export async function listUsers(query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    status: query.status,
    ...(query.q && {
      OR: [{ username: { contains: query.q } }, { email: { contains: query.q } }],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({ where, select: listSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.user.count({ where }),
  ]);

  return paginated(items, total, query);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...listSelect,
      referralCode: true,
      hideReferralCount: true,
      bannerUrl: true,
      updatedAt: true,
      balances: { select: { type: true, freeBalance: true, purchasedBalance: true } },
      badges: { select: { earnedAt: true, awardedById: true, badge: { select: { id: true, name: true, slug: true } } } },
      invitedVia: { select: { inviter: { select: { id: true, username: true } }, createdAt: true } },
      deletedAt: true,
      _count: { select: { clips: true, votes: true, referralsMade: true, giftsReceived: true, giftsSent: true, blockedBy: true } },
    },
  });
  if (!user) throw errors.notFound('User not found');

  return { ...user, battles: await getBattleStats(id) };
}

export async function updateUserStatus(id: string, status: UserStatus) {
  const current = await prisma.user.findUnique({ where: { id }, select: { status: true } });
  if (!current) throw errors.notFound('User not found');
  if (current.status === 'DELETED') throw new AppError(409, 'ACCOUNT_DELETED', 'This account was deleted by the player');
  const user = await prisma.user.update({ where: { id }, data: { status }, select: listSelect });
  // A suspended or banned player is signed out everywhere.
  if (status !== 'ACTIVE') {
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  return user;
}

export async function adjustCredits(userId: string, input: { type: CreditType; amount: number; note: string }, adminName: string) {
  const exists = await prisma.user.count({ where: { id: userId } });
  if (!exists) throw errors.notFound('User not found');
  return prisma.$transaction((tx) =>
    adjustPurchased(tx, {
      userId,
      type: input.type,
      amount: input.amount,
      reason: 'ADMIN_ADJUSTMENT',
      note: `${input.note} (by ${adminName})`.slice(0, 255),
    }),
  );
}
