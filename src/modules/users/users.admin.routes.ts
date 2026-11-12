import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { adminAdjustSchema, ledgerQuerySchema } from '../credits/credits.schemas';
import { listLedger } from '../credits/credits.service';
import { userIdParamsSchema } from './users.schemas';
import * as controller from './users.controller';
import * as usersService from './users.service';
import { awardBadge, revokeBadge } from '../badges/badges.service';
import { z } from 'zod';

// Dashboard: /api/admin/users
const router = Router();

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.patch('/:id/status', allowRoles('SUPER_ADMIN', 'ADMIN'), controller.updateStatus);

router.get('/:id/ledger', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const query = ledgerQuerySchema.parse(req.query);
  res.json({ data: await listLedger(id, query) });
});

router.post('/:id/credits', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const input = adminAdjustSchema.parse(req.body);
  res.json({ data: await usersService.adjustCredits(id, input, req.admin!.name) });
});

router.post('/:id/badges', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const { badgeId } = z.object({ badgeId: z.string().min(1).max(30) }).parse(req.body);
  await awardBadge(id, badgeId, req.admin!.id);
  res.status(201).json({ data: { ok: true } });
});

router.delete('/:id/badges/:badgeId', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { id, badgeId } = z.object({ id: z.string().min(1).max(30), badgeId: z.string().min(1).max(30) }).parse(req.params);
  await revokeBadge(id, badgeId);
  res.json({ data: { ok: true } });
});

export default router;
