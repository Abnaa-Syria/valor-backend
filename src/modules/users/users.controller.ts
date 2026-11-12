import type { Request, Response } from 'express';
import { listUsersQuerySchema, updateUserStatusSchema, userIdParamsSchema } from './users.schemas';
import * as usersService from './users.service';

export async function list(req: Request, res: Response) {
  const query = listUsersQuerySchema.parse(req.query);
  res.json({ data: await usersService.listUsers(query) });
}

export async function getOne(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await usersService.getUser(id) });
}

export async function updateStatus(req: Request, res: Response) {
  const { id } = userIdParamsSchema.parse(req.params);
  const { status } = updateUserStatusSchema.parse(req.body);
  res.json({ data: await usersService.updateUserStatus(id, status) });
}
