import type { Request, Response } from 'express';
import { adminIdParamsSchema, changePasswordSchema, createAdminSchema, loginSchema, updateAdminSchema } from './admins.schemas';
import * as adminsService from './admins.service';
import { audit } from '../audit/audit.service';

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await adminsService.login(email, password);
  res.json({ data: result });
}

export async function me(req: Request, res: Response) {
  const admin = await adminsService.getProfile(req.admin!.id);
  res.json({ data: admin });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await adminsService.changeOwnPassword(req.admin!.id, currentPassword, newPassword);
  res.json({ data: { ok: true } });
}

export async function list(_req: Request, res: Response) {
  res.json({ data: await adminsService.listAdmins() });
}

export async function create(req: Request, res: Response) {
  const input = createAdminSchema.parse(req.body);
  const admin = await adminsService.createAdmin(input);
  await audit(req, { action: 'admin.create', entityType: 'admin', entityId: admin.id, summary: `Created ${admin.role} ${admin.email}` });
  res.status(201).json({ data: admin });
}

export async function getOne(req: Request, res: Response) {
  const { id } = adminIdParamsSchema.parse(req.params);
  res.json({ data: await adminsService.getAdmin(id) });
}

export async function remove(req: Request, res: Response) {
  const { id } = adminIdParamsSchema.parse(req.params);
  const admin = await adminsService.deleteAdmin(req.admin!.id, id);
  await audit(req, { action: 'admin.delete', entityType: 'admin', entityId: id, summary: `Deleted admin ${admin.email}` });
  res.json({ data: { ok: true } });
}

export async function update(req: Request, res: Response) {
  const { id } = adminIdParamsSchema.parse(req.params);
  const input = updateAdminSchema.parse(req.body);
  const admin = await adminsService.updateAdmin(req.admin!.id, id, input);
  const { password, ...changed } = input;
  await audit(req, {
    action: 'admin.update',
    entityType: 'admin',
    entityId: id,
    summary: `Edited admin ${admin.email}${password ? ' (new password set)' : ''}`,
    details: changed,
  });
  res.json({ data: admin });
}
