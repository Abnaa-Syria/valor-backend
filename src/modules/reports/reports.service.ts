import type { Prisma, ReportStatus, ReportTarget } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { storage } from '../../lib/storage';
import { AppError, errors } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { adminRemoveClip, removeComment } from '../clips/clips.service';
import type { createReportSchema, resolveReportSchema } from './reports.schemas';

async function targetExists(type: ReportTarget, id: string) {
  if (type === 'CLIP') return (await prisma.clip.count({ where: { id, status: { not: 'REMOVED' } } })) > 0;
  if (type === 'COMMENT') return (await prisma.comment.count({ where: { id, status: 'VISIBLE' } })) > 0;
  return (await prisma.user.count({ where: { id } })) > 0;
}

export async function createReport(reporterId: string, input: z.infer<typeof createReportSchema>) {
  if (input.targetType === 'USER' && input.targetId === reporterId) throw errors.badRequest("You can't report yourself");
  if (!(await targetExists(input.targetType, input.targetId))) throw errors.notFound('Reported content not found');

  // One open report per player per target is enough.
  const open = await prisma.report.findFirst({
    where: { reporterId, targetType: input.targetType, targetId: input.targetId, status: 'OPEN' },
    select: { id: true },
  });
  if (open) return { id: open.id, status: 'OPEN' as const };

  const report = await prisma.report.create({ data: { reporterId, ...input }, select: { id: true, status: true } });
  return report;
}

/** A short description of what was reported, so moderators don't have to look it up. */
async function describeTargets(reports: { targetType: ReportTarget; targetId: string }[]) {
  const ids = (type: ReportTarget) => reports.filter((r) => r.targetType === type).map((r) => r.targetId);
  const [clips, comments, users] = await Promise.all([
    prisma.clip.findMany({
      where: { id: { in: ids('CLIP') } },
      select: { id: true, title: true, status: true, videoKey: true, thumbnailKey: true, user: { select: { id: true, username: true } } },
    }),
    prisma.comment.findMany({
      where: { id: { in: ids('COMMENT') } },
      select: { id: true, body: true, status: true, clipId: true, user: { select: { id: true, username: true } } },
    }),
    prisma.user.findMany({ where: { id: { in: ids('USER') } }, select: { id: true, username: true, status: true } }),
  ]);
  const map = new Map<string, unknown>();
  for (const c of clips) {
    map.set(`CLIP:${c.id}`, {
      title: c.title,
      status: c.status,
      owner: c.user,
      videoUrl: storage.url(c.videoKey),
      thumbnailUrl: storage.url(c.thumbnailKey),
    });
  }
  for (const c of comments) map.set(`COMMENT:${c.id}`, { body: c.body, status: c.status, clipId: c.clipId, owner: c.user });
  for (const u of users) map.set(`USER:${u.id}`, { username: u.username, status: u.status });
  return map;
}

export async function adminListReports(query: Pagination & { status?: ReportStatus; targetType?: ReportTarget }) {
  const where: Prisma.ReportWhereInput = { status: query.status, targetType: query.targetType };
  const [reports, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, username: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.report.count({ where }),
  ]);
  const targets = await describeTargets(reports);
  const items = reports.map((report) => ({ ...report, target: targets.get(`${report.targetType}:${report.targetId}`) ?? null }));
  return paginated(items, total, query);
}

export async function resolveReport(id: string, adminId: string, input: z.infer<typeof resolveReportSchema>) {
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) throw errors.notFound('Report not found');
  if (report.status !== 'OPEN') throw new AppError(409, 'REPORT_CLOSED', 'This report was already handled');

  if (input.status === 'RESOLVED' && input.removeContent) {
    if (report.targetType === 'CLIP') await adminRemoveClip(report.targetId, input.note || 'Reported content');
    if (report.targetType === 'COMMENT') await removeComment(report.targetId);
    // USER reports: suspend or ban from the Players page.
  }

  // Close every open report about the same target with the same decision.
  await prisma.report.updateMany({
    where: { targetType: report.targetType, targetId: report.targetId, status: 'OPEN' },
    data: { status: input.status, resolvedById: adminId, resolvedAt: new Date(), resolutionNote: input.note },
  });
  return prisma.report.findUniqueOrThrow({ where: { id } });
}
