import { Router } from 'express';
import { z } from 'zod';
import { CosmeticKind } from '@prisma/client';
import * as customizationService from './customization.service';

// Mobile: /api/v1/cosmetics?kind=FRAME|THEME|AVATAR
const router = Router();

router.get('/', async (req, res) => {
  const { kind } = z.object({ kind: z.enum(CosmeticKind).optional() }).parse(req.query);
  res.json({ data: await customizationService.listCosmetics(req.user!.id, kind) });
});

router.post('/:id/apply', async (req, res) => {
  const { id } = z.object({ id: z.string().min(1).max(30) }).parse(req.params);
  res.json({ data: await customizationService.applyCosmetic(req.user!.id, id) });
});

export default router;

// Public: /api/v1/app-config (no login) — the default theme for splash and auth screens.
export const appConfigRouter = Router();
appConfigRouter.get('/', async (_req, res) => {
  res.json({ data: await customizationService.getAppConfig() });
});
