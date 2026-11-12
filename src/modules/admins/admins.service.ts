import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { signAdminToken } from '../../lib/jwt';
import { AppError, errors } from '../../utils/app-error';
import type { createAdminSchema, updateAdminSchema } from './admins.schemas';

const BCRYPT_ROUNDS = 12;
const publicAdminSelect = { id: true, name: true, email: true, role: true, lastLoginAt: true } as const;
const listSelect = { ...publicAdminSelect, isActive: true, createdAt: true } as const;

export async function login(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email } });

  // Same message for unknown email and wrong password, so emails can't be probed.
  const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  if (!admin || !valid) throw errors.unauthorized('Email or password is incorrect');
  if (!admin.isActive) throw errors.forbidden('This account is disabled');

  const updated = await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
    select: publicAdminSelect,
  });

  return { token: signAdminToken(admin.id, admin.role), admin: updated };
}

export async function getProfile(adminId: string) {
  const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: publicAdminSelect });
  if (!admin) throw errors.notFound('Admin not found');
  return admin;
}

export async function changeOwnPassword(adminId: string, currentPassword: string, newPassword: string) {
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: adminId } });
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  }
  await prisma.admin.update({ where: { id: adminId }, data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) } });
}

// ───────────── Admin accounts (super admin only) ─────────────

export function listAdmins() {
  return prisma.admin.findMany({ select: listSelect, orderBy: { createdAt: 'asc' } });
}

export async function createAdmin(input: z.infer<typeof createAdminSchema>) {
  const exists = await prisma.admin.count({ where: { email: input.email } });
  if (exists) throw errors.conflict('An admin with this email already exists');
  return prisma.admin.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS) },
    select: listSelect,
  });
}

export async function updateAdmin(actorId: string, id: string, input: z.infer<typeof updateAdminSchema>) {
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) throw errors.notFound('Admin not found');

  // Never leave VALOR without an active super admin.
  const losesSuperAdmin =
    target.role === 'SUPER_ADMIN' && target.isActive && ((input.role && input.role !== 'SUPER_ADMIN') || input.isActive === false);
  if (losesSuperAdmin) {
    if (id === actorId) throw new AppError(409, 'CANNOT_DEMOTE_SELF', "You can't remove your own super admin access");
    const others = await prisma.admin.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
    if (others === 0) throw new AppError(409, 'LAST_SUPER_ADMIN', 'At least one active super admin is required');
  }

  const { password, ...rest } = input;
  return prisma.admin.update({
    where: { id },
    data: { ...rest, ...(password && { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) }) },
    select: listSelect,
  });
}

export async function getAdmin(id: string) {
  const admin = await prisma.admin.findUnique({
    where: { id },
    select: { ...listSelect, updatedAt: true, _count: { select: { auditLogs: true } } },
  });
  if (!admin) throw errors.notFound('Admin not found');
  return admin;
}

/** Deletes an admin account. Never yourself, never the last active super admin. */
export async function deleteAdmin(actorId: string, id: string) {
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) throw errors.notFound('Admin not found');
  if (id === actorId) throw new AppError(409, 'CANNOT_DELETE_SELF', "You can't delete your own account");
  if (target.role === 'SUPER_ADMIN' && target.isActive) {
    const others = await prisma.admin.count({ where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } } });
    if (others === 0) throw new AppError(409, 'LAST_SUPER_ADMIN', 'At least one active super admin is required');
  }
  await prisma.admin.delete({ where: { id } });
  return target;
}
