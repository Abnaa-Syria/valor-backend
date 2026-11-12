import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { audit } from '../audit/audit.service';
import { createGameSchema, gameIdParamsSchema, updateGameSchema } from './games.schemas';
import * as gamesService from './games.service';

// Dashboard: /api/admin/games
const router = Router();
const canEdit = allowRoles('SUPER_ADMIN', 'ADMIN');

router.get('/', async (_req, res) => {
  res.json({ data: await gamesService.listAllGames() });
});

router.get('/:id', async (req, res) => {
  const { id } = gameIdParamsSchema.parse(req.params);
  res.json({ data: await gamesService.getGame(id) });
});

router.post('/', canEdit, async (req, res) => {
  const input = createGameSchema.parse(req.body);
  const game = await gamesService.createGame(input);
  await audit(req, { action: 'game.create', entityType: 'game', entityId: game.id, summary: `Created game ${game.name}` });
  res.status(201).json({ data: game });
});

router.patch('/:id', canEdit, async (req, res) => {
  const { id } = gameIdParamsSchema.parse(req.params);
  const input = updateGameSchema.parse(req.body);
  const game = await gamesService.updateGame(id, input);
  await audit(req, { action: 'game.update', entityType: 'game', entityId: id, summary: `Edited game ${game.name}`, details: input });
  res.json({ data: game });
});

router.delete('/:id', canEdit, async (req, res) => {
  const { id } = gameIdParamsSchema.parse(req.params);
  const game = await gamesService.deleteGame(id);
  await audit(req, { action: 'game.delete', entityType: 'game', entityId: id, summary: `Deleted game ${game.name}` });
  res.json({ data: { ok: true } });
});

export default router;
