import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { idempotent } from '../../middlewares/idempotency';
import {
  activeBattlesQuerySchema,
  battleIdParamsSchema,
  createEntrySchema,
  featuredQuerySchema,
  historyQuerySchema,
  voteSchema,
} from './battles.schemas';
import * as battlesService from './battles.service';
import * as matchmaking from './matchmaking.service';
import * as rematchService from './rematch.service';
import { z } from 'zod';

const rematchBodySchema = z.object({ clipId: z.string().min(1).max(30) });

// Mobile: /api/v1/battles
const router = Router();

// ── Entries (matchmaking) ──

router.post('/entries', idempotent('battles.entries.create'), async (req, res) => {
  const input = createEntrySchema.parse(req.body);
  const result = await prisma.$transaction((tx) => matchmaking.createEntry(tx, { userId: req.user!.id, ...input }));
  const entry = await matchmaking.getEntry(req.user!.id, result.ticketId);
  res.status(201).json({ data: entry });
});

router.get('/entries', async (req, res) => {
  res.json({ data: await matchmaking.listMyEntries(req.user!.id) });
});

router.get('/entries/:id', async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  res.json({ data: await matchmaking.getEntry(req.user!.id, id) });
});

router.delete('/entries/:id', async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  res.json({ data: await matchmaking.cancelEntry(req.user!.id, id) });
});

// ── Battles ──

router.get('/', async (req, res) => {
  const query = activeBattlesQuerySchema.parse(req.query);
  res.json({ data: await battlesService.listActiveBattles(req.user!.id, query) });
});

router.get('/featured', async (req, res) => {
  const { gameId } = featuredQuerySchema.parse(req.query);
  res.json({ data: await battlesService.getFeaturedBattle(req.user!.id, gameId) });
});

router.get('/history', async (req, res) => {
  const query = historyQuerySchema.parse(req.query);
  res.json({ data: await battlesService.getHistory(req.user!.id, query) });
});

router.get('/:id', async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  res.json({ data: await battlesService.getBattle(req.user!.id, id) });
});

/** Loser asks for a rematch with a new clip: { clipId }. Costs 1 Challenge Credit. */
router.post('/:id/rematch', idempotent('battles.rematch'), async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { clipId } = rematchBodySchema.parse(req.body);
  res.status(201).json({ data: await rematchService.requestRematch(req.user!.id, id, clipId) });
});

router.post('/:id/votes', idempotent('battles.vote'), async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { side } = voteSchema.parse(req.body);
  res.status(201).json({ data: await battlesService.castVote(req.user!.id, id, side) });
});

export default router;
