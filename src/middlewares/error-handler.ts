import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { logger } from '../lib/logger';

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

export function notFoundHandler(req: Request, res: Response<ErrorBody>) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

// Express 5 forwards errors thrown in async handlers here automatically.
export function errorHandler(err: unknown, _req: Request, res: Response<ErrorBody>, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with this value already exists' } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
  }

  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR',
        message: tooLarge ? `File is larger than ${env.VIDEO_MAX_MB} MB` : err.message,
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error({ err }, 'Database unavailable');
    res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' } });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }

  // Standard HTTP errors from Express itself: body too large, missing upload file (express.static), etc.
  const httpStatus = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined;
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    const code = httpStatus === 404 ? 'NOT_FOUND' : httpStatus === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
    res.status(httpStatus).json({ error: { code, message: err instanceof Error ? err.message : 'Bad request' } });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
