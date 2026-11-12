import type { Request, Response } from 'express';
import { adminIdParamsSchema, changePasswordSchema, createAdminSchema, loginSchema, updateAdminSchema } from './admins.schemas';
import * as adminsService from './admins.service';

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
  res.status(201).json({ data: await adminsService.createAdmin(input) });
}

export async function update(req: Request, res: Response) {
  const { id } = adminIdParamsSchema.parse(req.params);
  const input = updateAdminSchema.parse(req.body);
  res.json({ data: await adminsService.updateAdmin(req.admin!.id, id, input) });
}
