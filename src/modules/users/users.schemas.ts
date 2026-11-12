import { z } from 'zod';
import { UserStatus } from '@prisma/client';
import { paginationSchema } from '../../utils/pagination';
import { usernameSchema } from '../auth/auth.schemas';

export const listUsersQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(UserStatus).optional(),
});

export const userIdParamsSchema = z.object({
  id: z.string().min(1).max(30),
});

// DELETED is set only by the player deleting their account.
export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
});

export const updateMeSchema = z.object({
  username: usernameSchema.optional(),
  hideReferralCount: z.boolean().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
