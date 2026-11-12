import { Router } from 'express';
import { z } from 'zod';
import { getLeaderboard } from './leaderboard.service';

// Mobile: /api/v1/leaderboard?period=weekly|monthly&gameId=
const router = Router();

const querySchema = z.object({
  period: z.enum(['weekly', 'monthly']).default('weekly'),
  gameId: z.string().min(1).max(30).optional(),
});

router.get('/', async (req, res) => {
  const { period, gameId } = querySchema.parse(req.query);
  res.json({ data: await getLeaderboard(req.user!.id, period, gameId) });
});

export default router;
