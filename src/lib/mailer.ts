import { env } from '../config/env';
import { logger } from './logger';

/**
 * Email sending. No provider is connected yet: in development the link is printed
 * to the server log so the flow can be tested end to end.
 */
export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${env.PASSWORD_RESET_URL}?token=${encodeURIComponent(token)}`;

  if (env.isProduction) {
    logger.warn({ to }, 'Password reset requested but no email provider is configured');
    return;
  }

  logger.info({ to, link }, 'Password reset email (dev: not sent, link logged)');
}
