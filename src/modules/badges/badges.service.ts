import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { AppError, errors } from '../../utils/app-error';
import { notify } from '../notifications/notifications.service';

/**
 * Badges
 * - A badge with `criteria` ({ metric, min }) is awarded automatically when the player reaches it.
 * - A badge without criteria (or marked "criteria pending") is awarded by an admin from the dashboard.
 * - Badges never add popularity (design 12f).
 */

export const badgeMetrics = ['battlesWon', 'battlesPlayed', 'gamesPlayed', 'clipsPublished'] as const;
export type BadgeMetric = (typeof badgeMetrics)[number];

export const badgeCriteriaSchema = z.object({
  metric: z.enum(badgeMetrics),
  min: z.number().int().min(1).max(100000),
});

function parseCriteria(value: unknown) {
  const parsed = badgeCriteriaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function computeMetric(userId: string, metric: BadgeMetric): Promise<number> {
  const mine = { OR: [{ clipA: { userId } }, { clipB: { userId } }] };
  switch (metric) {
    case 'battlesWon':
      return prisma.battle.count({
        where: { status: 'CLOSED', OR: [{ winnerSide: 'A', clipA: { userId } }, { winnerSide: 'B', clipB: { userId } }] },
      });
    case 'battlesPlayed':
      return prisma.battle.count({ where: { status: 'CLOSED', ...mine } });
    case 'gamesPlayed':
      return (await prisma.clip.findMany({ where: { userId, status: { not: 'REMOVED' } }, distinct: ['gameId'], select: { gameId: true } })).length;
    case 'clipsPublished':
      return prisma.clip.count({ where: { userId, status: { not: 'REMOVED' } } });
  }
}

/** Awards every automatic badge the player now qualifies for. Never throws (runs after the main action). */
export async function checkBadges(userId: string) {
  try {
    const candidates = await prisma.badge.findMany({
      where: { isActive: true, isCriteriaPending: false, holders: { none: { userId } } },
    });
    const cache = new Map<BadgeMetric, number>();
    for (const badge of candidates) {
      const criteria = parseCriteria(badge.criteria);
      if (!criteria) continue;
      if (!cache.has(criteria.metric)) cache.set(criteria.metric, await computeMetric(userId, criteria.metric));
      if (cache.get(criteria.metric)! >= criteria.min) await grant(userId, badge.id, badge.name);
    }
  } catch (err) {
    logger.error({ err, userId }, 'Badge check failed');
  }
}

async function grant(userId: string, badgeId: string, badgeName: string, awardedById?: string) {
  await prisma.$transaction(async (tx) => {
    const created = await tx.userBadge.createMany({ data: [{ userId, badgeId, awardedById }], skipDuplicates: true });
    if (created.count === 0) return;
    await notify(tx, userId, 'BADGE_EARNED', {
      title: 'Badge earned',
      body: `You earned the ${badgeName} badge.`,
      data: { badgeId },
    });
  });
}

const badgeSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  iconUrl: true,
  criteria: true,
  isCriteriaPending: true,
  sortOrder: true,
} satisfies Prisma.BadgeSelect;

/** Earned + locked badges for a profile (design 12f). */
export async function getPlayerBadges(userId: string) {
  const [badges, earned] = await Promise.all([
    prisma.badge.findMany({ where: { isActive: true }, select: badgeSelect, orderBy: { sortOrder: 'asc' } }),
    prisma.userBadge.findMany({ where: { userId }, select: { badgeId: true, earnedAt: true } }),
  ]);
  const earnedAt = new Map(earned.map((e) => [e.badgeId, e.earnedAt]));
  const withState = badges.map((badge) => ({ ...badge, earnedAt: earnedAt.get(badge.id) ?? null }));
  return {
    earned: withState.filter((b) => b.earnedAt),
    locked: withState.filter((b) => !b.earnedAt),
  };
}

// ───────────── Dashboard ─────────────

export const badgeInputSchema = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(255).nullish(),
  iconUrl: z.url().max(500).nullish(),
  criteria: badgeCriteriaSchema.nullish(),
  isCriteriaPending: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export async function adminListBadges() {
  const badges = await prisma.badge.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { ...badgeSelect, isActive: true, _count: { select: { holders: true } } },
  });
  return badges.map(({ _count, ...badge }) => ({ ...badge, holders: _count.holders }));
}

export async function createBadge(input: z.infer<typeof badgeInputSchema>) {
  const { criteria, ...rest } = input;
  return prisma.badge.create({ data: { ...rest, criteria: criteria ?? undefined } });
}

export async function updateBadge(id: string, input: Partial<z.infer<typeof badgeInputSchema>>) {
  const { criteria, ...rest } = input;
  return prisma.badge.update({
    where: { id },
    data: { ...rest, ...(criteria !== undefined && { criteria: criteria === null ? Prisma.DbNull : criteria }) },
  });
}

export async function awardBadge(userId: string, badgeId: string, adminId: string) {
  const [user, badge] = await Promise.all([
    prisma.user.count({ where: { id: userId } }),
    prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true, name: true } }),
  ]);
  if (!user) throw errors.notFound('User not found');
  if (!badge) throw errors.notFound('Badge not found');
  const already = await prisma.userBadge.count({ where: { userId, badgeId } });
  if (already) throw new AppError(409, 'ALREADY_EARNED', 'The player already has this badge');
  await grant(userId, badge.id, badge.name, adminId);
}

export async function revokeBadge(userId: string, badgeId: string) {
  await prisma.userBadge.deleteMany({ where: { userId, badgeId } });
}
