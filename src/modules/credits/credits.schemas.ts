import { z } from 'zod';
import { CreditType } from '@prisma/client';
import { paginationSchema } from '../../utils/pagination';

export const ledgerQuerySchema = paginationSchema.extend({
  type: z.enum(CreditType).optional(),
});

export const adminAdjustSchema = z.object({
  type: z.enum(CreditType),
  amount: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((value) => value !== 0, 'Amount cannot be 0'),
  note: z.string().trim().min(3).max(255),
});
