import { Router } from 'express';
import { z } from 'zod';
import { idempotent } from '../../middlewares/idempotency';
import * as rematchService from './rematch.service';

// Mobile: /api/v1/rematches  (request one with POST /v1/battles/:id/rematch)
const router = Router();

const idParams = z.object({ id: z.string().min(1).max(30) });
const clipBody = z.object({ clipId: z.string().min(1).max(30) });

router.get('/', async (req, res) => {
  res.json({ data: await rematchService.listMyRematches(req.user!.id) });
});

router.get('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await rematchService.getRematch(req.user!.id, id) });
});

/** Opponent accepts with their own clip; costs 1 Challenge Credit; the battle starts right away. */
router.post('/:id/accept', idempotent('rematch.accept'), async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { clipId } = clipBody.parse(req.body);
  res.json({ data: await rematchService.acceptRematch(req.user!.id, id, clipId) });
});

router.post('/:id/decline', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await rematchService.declineRematch(req.user!.id, id) });
});

/** Challenger withdraws a pending request (refunded). */
router.delete('/:id', async (req, res) => {
  const { id } = idParams.parse(req.params);
  res.json({ data: await rematchService.cancelRematch(req.user!.id, id) });
});

export default router;
