import { z } from 'zod';
import { AdminRole } from '@prisma/client';

const password = z.string().min(10, 'Password must be at least 10 characters').max(100);

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const createAdminSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().trim().toLowerCase().max(191),
  role: z.enum(AdminRole),
  password,
});

export const updateAdminSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(AdminRole).optional(),
  isActive: z.boolean().optional(),
  /** Sets a new password for another admin (they should change it after logging in). */
  password: password.optional(),
});

export const adminIdParamsSchema = z.object({ id: z.string().min(1).max(30) });
