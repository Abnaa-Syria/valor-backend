import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';

/**
 * Announcements: a message from VALOR that lands in players' notification centre (bell).
 * Audience: every active player, or one player. Push delivery comes with the mobile app.
 */
export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(255),
  audience: z.enum(['ALL', 'PLAYER']),
  userId: z.string().min(1).max(30).optional(),
});

const BATCH = 1000;

export async function sendAnnouncement(adminId: string, input: z.infer<typeof announcementSchema>) {
  let recipients = 0;
  if (input.audience === 'PLAYER') {
    if (!input.userId) throw errors.badRequest('Choose the player');
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { status: true } });
    if (!user || user.status === 'DELETED') throw errors.notFound('Player not found');
    await prisma.notification.create({
      data: { userId: input.userId, type: 'ANNOUNCEMENT', title: input.title, body: input.body },
    });
    recipients = 1;
  } else {
    // Every active player, in batches.
    let cursor: string | undefined;
    for (;;) {
      const users = await prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor && { skip: 1, cursor: { id: cursor } }),
      });
      if (users.length === 0) break;
      await prisma.notification.createMany({
        data: users.map((u) => ({ userId: u.id, type: 'ANNOUNCEMENT' as const, title: input.title, body: input.body })),
      });
      recipients += users.length;
      cursor = users[users.length - 1].id;
      if (users.length < BATCH) break;
    }
  }

  return prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      userId: input.audience === 'PLAYER' ? input.userId : null,
      recipients,
      createdById: adminId,
    },
  });
}

export async function listAnnouncements(query: Pagination) {
  const [items, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
      ...toSkipTake(query),
    }),
    prisma.announcement.count(),
  ]);
  const userIds = items.map((a) => a.userId).filter((id): id is string => Boolean(id));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } });
  const names = new Map(users.map((u) => [u.id, u.username]));
  return paginated(items.map((a) => ({ ...a, username: a.userId ? (names.get(a.userId) ?? null) : null })), total, query);
}
