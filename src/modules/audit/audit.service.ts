import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';

/**
 * Admin audit log: every change made from the dashboard is recorded with who did it.
 * Recording never blocks the action itself (a failed write is logged and ignored).
 */
export async function audit(
  req: Request,
  entry: { action: string; entityType: string; entityId?: string | null; summary: string; details?: unknown },
) {
  if (!req.admin) return;
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 255),
        details: entry.details === undefined ? undefined : (entry.details as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Could not write audit log');
  }
}

export async function listAudit(query: Pagination & { adminId?: string; entityType?: string; entityId?: string; q?: string }) {
  const where: Prisma.AdminAuditLogWhereInput = {
    adminId: query.adminId,
    entityType: query.entityType,
    entityId: query.entityId,
    ...(query.q && { OR: [{ summary: { contains: query.q } }, { action: { contains: query.q } }] }),
  };
  const [items, total] = await prisma.$transaction([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { id: true, name: true, email: true } } },
      ...toSkipTake(query),
    }),
    prisma.adminAuditLog.count({ where }),
  ]);
  return paginated(items, total, query);
}

export async function auditEntityTypes() {
  const rows = await prisma.adminAuditLog.findMany({ distinct: ['entityType'], select: { entityType: true } });
  return rows.map((row) => row.entityType).sort();
}
