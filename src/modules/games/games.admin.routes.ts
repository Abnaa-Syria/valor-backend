import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { createGameSchema, gameIdParamsSchema, updateGameSchema } from './games.schemas';
import * as gamesService from './games.service';

// Dashboard: /api/admin/games
const router = Router();

router.get('/', async (_req, res) => {
  res.json({ data: await gamesService.listAllGames() });
});

router.post('/', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const input = createGameSchema.parse(req.body);
  res.status(201).json({ data: await gamesService.createGame(input) });
});

router.patch('/:id', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const { id } = gameIdParamsSchema.parse(req.params);
  const input = updateGameSchema.parse(req.body);
  res.json({ data: await gamesService.updateGame(id, input) });
});

export default router;
