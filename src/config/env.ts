import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_BASE_URL: z.url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),

  JWT_ADMIN_SECRET: z.string().min(32, 'JWT_ADMIN_SECRET must be at least 32 characters'),
  JWT_ADMIN_EXPIRES_IN: z.string().default('12h'),
  JWT_USER_SECRET: z.string().min(32, 'JWT_USER_SECRET must be at least 32 characters'),
  JWT_USER_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  PASSWORD_RESET_URL: z.string().default('valor://reset-password'),
  // Invite links: <INVITE_BASE_URL>/<referral code>
  INVITE_BASE_URL: z.string().default('https://valor.gg/i'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  UPLOAD_DIR: z.string().default('uploads'),
  VIDEO_MAX_MB: z.coerce.number().int().min(1).max(2048).default(200),

  // Accept purchases with provider "TEST" (no real payment). Defaults to on outside production.
  PAYMENTS_TEST_MODE: z.enum(['true', 'false']).optional(),

  JOBS_ENABLED: booleanString,
  JOBS_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  // Push notifications (Firebase Cloud Messaging): the service-account JSON, or a path to the file. Empty = push off.
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  PUSH_INTERVAL_SECONDS: z.coerce.number().int().min(2).max(300).default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PUBLIC_BASE_URL: parsed.data.PUBLIC_BASE_URL.replace(/\/$/, ''),
  isProduction: parsed.data.NODE_ENV === 'production',
  paymentsTestMode:
    parsed.data.PAYMENTS_TEST_MODE !== undefined
      ? parsed.data.PAYMENTS_TEST_MODE === 'true'
      : parsed.data.NODE_ENV !== 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};
