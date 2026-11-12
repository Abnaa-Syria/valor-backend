import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { verifyUserToken } from '../lib/jwt';
import { AppError, errors } from '../utils/app-error';

/** Protects mobile API routes: valid access token and an active account. */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw errors.unauthorized();

  const payload = verifyUserToken(token);
  if (!payload) throw new AppError(401, 'TOKEN_EXPIRED', 'Access token is invalid or expired');

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true, status: true },
  });
  if (!user) throw errors.unauthorized('Account not found');
  assertActive(user.status);

  req.user = { id: user.id, username: user.username };
  next();
}

export function assertActive(status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED') {
  if (status === 'DELETED') throw new AppError(401, 'ACCOUNT_DELETED', 'This account was deleted');
  if (status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  if (status === 'BANNED') throw new AppError(403, 'ACCOUNT_BANNED', 'This account is banned');
}
