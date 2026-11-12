import type { NextFunction, Request, Response } from 'express';
import type { AdminRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { verifyAdminToken } from '../lib/jwt';
import { errors } from '../utils/app-error';

/**
 * Restricts a route to some roles. Use after requireAdmin(), e.g. allowRoles('SUPER_ADMIN').
 */
export function allowRoles(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) throw errors.unauthorized();
    if (!roles.includes(req.admin.role)) throw errors.forbidden();
    next();
  };
}

/**
 * Protects dashboard routes: checks the token and that the admin is still active.
 * Pass roles to restrict the route further, e.g. requireAdmin('SUPER_ADMIN').
 */
export function requireAdmin(...roles: AdminRole[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw errors.unauthorized();

    const payload = verifyAdminToken(token);
    if (!payload) throw errors.unauthorized('Session expired, please log in again');

    const admin = await prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!admin || !admin.isActive) throw errors.unauthorized('Account is not active');

    if (roles.length > 0 && !roles.includes(admin.role)) throw errors.forbidden();

    req.admin = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
    next();
  };
}
