import { Router } from 'express';
import * as gamesService from './games.service';

// Mobile: /api/v1/games
const router = Router();

router.get('/', async (_req, res) => {
  res.json({ data: await gamesService.listActiveGames() });
});

export default router;
