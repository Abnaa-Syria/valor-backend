import { z } from 'zod';
import { ReportStatus, ReportTarget } from '@prisma/client';
import { paginationSchema } from '../../utils/pagination';

export const createReportSchema = z.object({
  targetType: z.enum(ReportTarget),
  targetId: z.string().min(1).max(30),
  reason: z.string().trim().min(3).max(500),
});

export const adminReportsQuerySchema = paginationSchema.extend({
  status: z.enum(ReportStatus).optional(),
  targetType: z.enum(ReportTarget).optional(),
});

export const resolveReportSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  note: z.string().trim().max(500).optional(),
  /** RESOLVED only: also remove the reported clip or comment. */
  removeContent: z.boolean().default(false),
});

export const reportIdParamsSchema = z.object({ id: z.string().min(1).max(30) });
