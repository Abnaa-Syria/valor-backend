import type { Request, Response } from 'express';
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from './auth.schemas';
import * as authService from './auth.service';

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  res.status(201).json({ data: await authService.register(input) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  res.json({ data: await authService.login(email, password) });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json({ data: await authService.refresh(refreshToken) });
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  await authService.logout(refreshToken);
  res.json({ data: { ok: true } });
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(email);
  res.json({ data: { ok: true } });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password);
  res.json({ data: { ok: true } });
}
