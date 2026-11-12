import { Router } from 'express';
import { z } from 'zod';
import { allowRoles } from '../../middlewares/admin-auth';
import { audit } from '../audit/audit.service';
import * as badgesService from './badges.service';

// Dashboard: /api/admin/badges
const router = Router();
const idParams = z.object({ id: z.string().min(1).max(30) });
const canEdit = allowRoles('SUPER_ADMIN', 'ADMIN');

router.get('/', async (_req, res) => {
  res.json({ data: await badgesService.adminListBadges() });
});

router.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await badgesService.adminGetBadge(id) });
});

router.post('/', canEdit, async (req, res) => {
  const input = badgesService.badgeInputSchema.parse(req.body);
  const badge = await badgesService.createBadge(input);
  await audit(req, { action: 'badge.create', entityType: 'badge', entityId: badge.id, summary: `Created badge ${badge.name}` });
  res.status(201).json({ data: badge });
});

router.patch('/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = badgesService.badgeInputSchema.partial().parse(req.body);
  const badge = await badgesService.updateBadge(id, input);
  await audit(req, { action: 'badge.update', entityType: 'badge', entityId: id, summary: `Edited badge ${badge.name}`, details: input });
  res.json({ data: badge });
});

router.delete('/:id', canEdit, async (req, res) => {
  const { id } = idParams.parse(req.params);
  const badge = await badgesService.deleteBadge(id);
  await audit(req, { action: 'badge.delete', entityType: 'badge', entityId: id, summary: `Deleted badge ${badge.name}` });
  res.json({ data: { ok: true } });
});

export default router;
