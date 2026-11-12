import { z } from 'zod';
import { BattleSide, BattleStatus } from '@prisma/client';
import { paginationSchema } from '../../utils/pagination';
import { battleCriteriaSchema } from '../clips/clips.schemas';

export const battleIdParamsSchema = z.object({ id: z.string().min(1).max(30) });

export const createEntrySchema = battleCriteriaSchema.extend({
  clipId: z.string().min(1).max(30),
});

export const voteSchema = z.object({ side: z.enum(BattleSide) });

export const activeBattlesQuerySchema = paginationSchema.extend({
  gameId: z.string().min(1).max(30).optional(),
});

export const featuredQuerySchema = z.object({
  gameId: z.string().min(1).max(30).optional(),
});

export const historyQuerySchema = paginationSchema.extend({
  gameId: z.string().min(1).max(30).optional(),
  result: z.enum(['won', 'lost']).optional(),
});

export const adminBattlesQuerySchema = paginationSchema.extend({
  userId: z.string().min(1).max(30).optional(),
  gameId: z.string().min(1).max(30).optional(),
  status: z.enum(BattleStatus).optional(),
});

export const cancelBattleSchema = z.object({
  reason: z.string().trim().min(3).max(200),
});
