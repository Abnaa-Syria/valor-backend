import { Router } from 'express';
import { z } from 'zod';
import { allowRoles } from '../../middlewares/admin-auth';
import * as badgesService from './badges.service';

// Dashboard: /api/admin/badges
const router = Router();
const idParams = z.object({ id: z.string().min(1).max(30) });

router.get('/', async (_req, res) => {
  res.json({ data: await badgesService.adminListBadges() });
});

router.post('/', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const input = badgesService.badgeInputSchema.parse(req.body);
  res.status(201).json({ data: await badgesService.createBadge(input) });
});

router.patch('/:id', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = badgesService.badgeInputSchema.partial().parse(req.body);
  res.json({ data: await badgesService.updateBadge(id, input) });
});

export default router;
