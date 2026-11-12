import { Router } from 'express';
import { z } from 'zod';
import { PurchaseKind, PurchaseStatus } from '@prisma/client';
import { allowRoles } from '../../middlewares/admin-auth';
import { paginationSchema } from '../../utils/pagination';
import { audit } from '../audit/audit.service';
import { adminCatalog, cosmeticInputSchema, getThemeTokenGroups, giftInputSchema, packInputSchema } from './catalog.service';
import { adminListPurchases } from './store.service';
import { adminGetPurchase, refundPurchase } from './purchases.admin.service';

// Dashboard: /api/admin/store
const router = Router();
const idParams = z.object({ id: z.string().min(1).max(30) });
const canEdit = allowRoles('SUPER_ADMIN', 'ADMIN');

// ── Purchases ──
router.get('/purchases', async (req, res) => {
  const query = paginationSchema
    .extend({
      status: z.enum(PurchaseStatus).optional(),
      kind: z.enum(PurchaseKind).optional(),
      q: z.string().trim().max(100).optional(),
      userId: z.string().max(30).optional(),
    })
    .parse(req.query);
  res.json({ data: await adminListPurchases(query) });
});

router.get('/purchases/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await adminGetPurchase(id) });
});

router.post('/purchases/:id/refund', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body);
  const result = await refundPurchase(id, reason);
  await audit(req, { action: 'purchase.refund', entityType: 'purchase', entityId: id, summary: `Refunded: ${reason} — ${result.outcome}` });
  res.json({ data: result });
});

// ── Credit packs ──
router.get('/packs', async (_req, res) => {
  res.json({ data: await adminCatalog.listPacks() });
});
router.get('/packs/:id', async (req, res) => {
  res.json({ data: await adminCatalog.getPack(idParams.parse(req.params).id) });
});
router.post('/packs', canEdit, async (req, res) => {
  const pack = await adminCatalog.createPack(packInputSchema.parse(req.body));
  await audit(req, { action: 'pack.create', entityType: 'pack', entityId: pack.id, summary: `Created ${pack.credits} ${pack.type.toLowerCase()} credits pack` });
  res.status(201).json({ data: pack });
});
router.patch('/packs/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = packInputSchema.partial().parse(req.body);
  const pack = await adminCatalog.updatePack(id, input);
  await audit(req, { action: 'pack.update', entityType: 'pack', entityId: id, summary: `Edited ${pack.credits} ${pack.type.toLowerCase()} credits pack`, details: input });
  res.json({ data: pack });
});
router.delete('/packs/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const pack = await adminCatalog.deletePack(id);
  await audit(req, { action: 'pack.delete', entityType: 'pack', entityId: id, summary: `Deleted ${pack.credits} ${pack.type.toLowerCase()} credits pack` });
  res.json({ data: { ok: true } });
});

// ── Gifts ──
router.get('/gifts', async (_req, res) => {
  res.json({ data: await adminCatalog.listGifts() });
});
router.get('/gifts/:id', async (req, res) => {
  res.json({ data: await adminCatalog.getGift(idParams.parse(req.params).id) });
});
router.post('/gifts', canEdit, async (req, res) => {
  const gift = await adminCatalog.createGift(giftInputSchema.parse(req.body));
  await audit(req, { action: 'gift.create', entityType: 'gift', entityId: gift.id, summary: `Created gift ${gift.name}` });
  res.status(201).json({ data: gift });
});
router.patch('/gifts/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = giftInputSchema.partial().parse(req.body);
  const gift = await adminCatalog.updateGift(id, input);
  await audit(req, { action: 'gift.update', entityType: 'gift', entityId: id, summary: `Edited gift ${gift.name}`, details: input });
  res.json({ data: gift });
});
router.delete('/gifts/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const gift = await adminCatalog.deleteGift(id);
  await audit(req, { action: 'gift.delete', entityType: 'gift', entityId: id, summary: `Deleted gift ${gift.name}` });
  res.json({ data: { ok: true } });
});

// ── Frames, themes & avatars ──
router.get('/theme-tokens', (_req, res) => {
  res.json({ data: getThemeTokenGroups() });
});
router.get('/cosmetics', async (_req, res) => {
  res.json({ data: await adminCatalog.listCosmetics() });
});
router.get('/cosmetics/:id', async (req, res) => {
  res.json({ data: await adminCatalog.getCosmetic(idParams.parse(req.params).id) });
});
router.post('/cosmetics', canEdit, async (req, res) => {
  const item = await adminCatalog.createCosmetic(cosmeticInputSchema.parse(req.body));
  await audit(req, { action: `${item.kind.toLowerCase()}.create`, entityType: item.kind.toLowerCase(), entityId: item.id, summary: `Created ${item.kind.toLowerCase()} ${item.name}` });
  res.status(201).json({ data: item });
});
router.patch('/cosmetics/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = cosmeticInputSchema.partial().parse(req.body);
  const item = await adminCatalog.updateCosmetic(id, input);
  const { metadata: _design, ...changed } = input;
  await audit(req, {
    action: `${item.kind.toLowerCase()}.update`,
    entityType: item.kind.toLowerCase(),
    entityId: id,
    summary: `Edited ${item.kind.toLowerCase()} ${item.name}${input.metadata !== undefined ? ' (design)' : ''}`,
    details: changed,
  });
  res.json({ data: item });
});
router.delete('/cosmetics/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const item = await adminCatalog.deleteCosmetic(id);
  await audit(req, { action: `${item.kind.toLowerCase()}.delete`, entityType: item.kind.toLowerCase(), entityId: id, summary: `Deleted ${item.kind.toLowerCase()} ${item.name}` });
  res.json({ data: { ok: true } });
});

export default router;
