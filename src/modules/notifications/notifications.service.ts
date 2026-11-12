import type { NotificationType, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * In-app notifications (the bell on Home).
 * Call `notify` inside the same transaction as the event, so a notification
 * exists only if the event really happened. Push delivery is added with the mobile app.
 */
export async function notify(
  db: Db,
  userId: string,
  type: NotificationType,
  content: { title: string; body: string; data?: Record<string, unknown> },
) {
  await db.notification.create({
    data: {
      userId,
      type,
      title: content.title.slice(0, 120),
      body: content.body.slice(0, 255),
      data: content.data as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listNotifications(userId: string, query: Pagination & { unreadOnly?: boolean }) {
  const where: Prisma.NotificationWhereInput = { userId, ...(query.unreadOnly && { readAt: null }) };
  const [items, total, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
      ...toSkipTake(query),
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { unreadCount: unread, ...paginated(items, total, query) };
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** Marks the given notifications as read, or all of them when `ids` is omitted. */
export async function markRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids && { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return { unreadCount: await unreadCount(userId) };
}
