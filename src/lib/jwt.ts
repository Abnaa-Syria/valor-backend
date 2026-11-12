import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AdminRole } from '@prisma/client';
import { env } from '../config/env';

type TokenKind = 'admin' | 'user';

export type AdminTokenPayload = { sub: string; role: AdminRole; type: 'admin' };
export type UserTokenPayload = { sub: string; type: 'user' };

function sign(payload: object, secret: string, expiresIn: string) {
  return jwt.sign(payload, secret, { expiresIn: expiresIn as SignOptions['expiresIn'] });
}

function verify<T extends { sub: string; type: TokenKind }>(token: string, secret: string, type: TokenKind): T | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'object' && decoded.type === type && typeof decoded.sub === 'string') {
      return decoded as T;
    }
    return null;
  } catch {
    return null;
  }
}

// Admins (dashboard) and players (mobile app) use separate secrets,
// so a player token can never be used on the dashboard API.

export function signAdminToken(adminId: string, role: AdminRole): string {
  const payload: AdminTokenPayload = { sub: adminId, role, type: 'admin' };
  return sign(payload, env.JWT_ADMIN_SECRET, env.JWT_ADMIN_EXPIRES_IN);
}

export function verifyAdminToken(token: string) {
  return verify<AdminTokenPayload>(token, env.JWT_ADMIN_SECRET, 'admin');
}

export function signUserToken(userId: string): string {
  const payload: UserTokenPayload = { sub: userId, type: 'user' };
  return sign(payload, env.JWT_USER_SECRET, env.JWT_USER_EXPIRES_IN);
}

export function verifyUserToken(token: string) {
  return verify<UserTokenPayload>(token, env.JWT_USER_SECRET, 'user');
}
