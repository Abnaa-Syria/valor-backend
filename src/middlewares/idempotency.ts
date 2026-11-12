import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { AppError, errors } from '../utils/app-error';

/**
 * Makes a write request safe to retry (votes, battle entries, purchases).
 *
 * The app sends a fresh `Idempotency-Key` header per user action and reuses it on retries.
 * - First request: runs normally. A successful response is stored.
 * - Retry after success: the stored response is returned; nothing runs twice.
 * - Retry after a failure (4xx/5xx): the key is released and the request runs again —
 *   failed requests change nothing because their transaction rolled back.
 */
export function idempotent(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('Idempotency-Key')?.trim();
    if (!key) throw errors.badRequest('Idempotency-Key header is required');
    if (key.length > 100) throw errors.badRequest('Idempotency-Key is too long');

    const userId = req.user!.id;

    try {
      await prisma.idempotencyKey.create({ data: { userId, key, endpoint } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;

      const existing = await prisma.idempotencyKey.findUnique({ where: { userId_key: { userId, key } } });
      if (!existing) throw err;
      if (existing.endpoint !== endpoint) {
        throw errors.conflict('This Idempotency-Key was already used for a different request');
      }
      if (existing.statusCode === null) {
        throw new AppError(409, 'REQUEST_IN_PROGRESS', 'The same request is still being processed');
      }
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const statusCode = res.statusCode;
      const write =
        statusCode < 400
          ? prisma.idempotencyKey.update({
              where: { userId_key: { userId, key } },
              data: { statusCode, responseBody: body as Prisma.InputJsonValue },
            })
          : prisma.idempotencyKey.delete({ where: { userId_key: { userId, key } } });
      write.catch((error: unknown) => logger.error({ error, key }, 'Could not save idempotency result'));
      return originalJson(body);
    };

    next();
  };
}
