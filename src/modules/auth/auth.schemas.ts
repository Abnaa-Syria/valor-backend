import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[A-Za-z0-9_]+$/, 'Use letters, numbers and underscores only');

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(100);

export const registerSchema = z.object({
  username: usernameSchema,
  email: z.email().trim().toLowerCase().max(191),
  password: passwordSchema,
  referralCode: z.string().trim().toUpperCase().max(20).optional(),
});

export const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(100),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.email().trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
