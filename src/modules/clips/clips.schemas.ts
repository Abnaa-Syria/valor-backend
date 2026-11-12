import { z } from 'zod';
import { ClipStatus } from '@prisma/client';
import { paginationSchema } from '../../utils/pagination';

export const battleCriteriaSchema = z.object({
  weaponClass: z.string().trim().min(1).max(60),
  rank: z.string().trim().min(1).max(60),
});

/** Multipart text fields sent with the video. `battle` is JSON, sent only for "Enter 1v1 battle". */
export const createClipSchema = z.object({
  gameId: z.string().min(1).max(30),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().transform((value) => value || undefined),
  durationSec: z.coerce.number().int().min(1).max(600).optional(),
  battle: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) return undefined;
      try {
        return battleCriteriaSchema.parse(JSON.parse(value));
      } catch {
        ctx.addIssue({ code: 'custom', message: 'battle must be JSON: {"weaponClass":"...","rank":"..."}' });
        return z.NEVER;
      }
    }),
});

export const updateClipSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});

export const clipIdParamsSchema = z.object({ id: z.string().min(1).max(30) });
export const commentParamsSchema = z.object({ id: z.string().min(1).max(30), commentId: z.string().min(1).max(30) });

export const galleryQuerySchema = paginationSchema.extend({
  gameId: z.string().min(1).max(30).optional(),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(500),
});

export const adminClipsQuerySchema = paginationSchema.extend({
  gameId: z.string().min(1).max(30).optional(),
  status: z.enum(ClipStatus).optional(),
  q: z.string().trim().max(100).optional(),
});
