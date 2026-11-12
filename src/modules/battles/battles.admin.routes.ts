import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { adminBattlesQuerySchema, battleIdParamsSchema, cancelBattleSchema } from './battles.schemas';
import * as battlesService from './battles.service';

// Dashboard: /api/admin/battles
const router = Router();

router.get('/', async (req, res) => {
  const query = adminBattlesQuerySchema.parse(req.query);
  res.json({ data: await battlesService.adminListBattles(query) });
});

router.get('/:id', async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  res.json({ data: await battlesService.adminGetBattle(id) });
});

router.post('/:id/cancel', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { reason } = cancelBattleSchema.parse(req.body);
  await battlesService.cancelBattle(id, reason);
  res.json({ data: await battlesService.adminGetBattle(id) });
});

export default router;
