import { Router } from 'express';
import { z } from 'zod';
import { PurchaseKind, PurchaseStatus } from '@prisma/client';
import { allowRoles } from '../../middlewares/admin-auth';
import { paginationSchema } from '../../utils/pagination';
import { adminCatalog, cosmeticInputSchema, getThemeTokenGroups, giftInputSchema, packInputSchema } from './catalog.service';
import { adminListPurchases } from './store.service';

// Dashboard: /api/admin/store
const router = Router();
const idParams = z.object({ id: z.string().min(1).max(30) });
const canEdit = allowRoles('SUPER_ADMIN', 'ADMIN');

router.get('/purchases', async (req, res) => {
  const query = paginationSchema
    .extend({
      status: z.enum(PurchaseStatus).optional(),
      kind: z.enum(PurchaseKind).optional(),
      q: z.string().trim().max(100).optional(),
    })
    .parse(req.query);
  res.json({ data: await adminListPurchases(query) });
});

// Credit packs
router.get('/packs', async (_req, res) => {
  res.json({ data: await adminCatalog.listPacks() });
});
router.post('/packs', canEdit, async (req, res) => {
  res.status(201).json({ data: await adminCatalog.createPack(packInputSchema.parse(req.body)) });
});
router.patch('/packs/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await adminCatalog.updatePack(id, packInputSchema.partial().parse(req.body)) });
});

// Gifts
router.get('/gifts', async (_req, res) => {
  res.json({ data: await adminCatalog.listGifts() });
});
router.post('/gifts', canEdit, async (req, res) => {
  res.status(201).json({ data: await adminCatalog.createGift(giftInputSchema.parse(req.body)) });
});
router.patch('/gifts/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await adminCatalog.updateGift(id, giftInputSchema.partial().parse(req.body)) });
});

// Frames, themes & avatars
router.get('/theme-tokens', (_req, res) => {
  res.json({ data: getThemeTokenGroups() });
});
router.get('/cosmetics', async (_req, res) => {
  res.json({ data: await adminCatalog.listCosmetics() });
});
router.post('/cosmetics', canEdit, async (req, res) => {
  res.status(201).json({ data: await adminCatalog.createCosmetic(cosmeticInputSchema.parse(req.body)) });
});
router.patch('/cosmetics/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await adminCatalog.updateCosmetic(id, cosmeticInputSchema.partial().parse(req.body)) });
});

export default router;
