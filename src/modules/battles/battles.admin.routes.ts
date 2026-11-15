import { Router } from 'express';
import { z } from 'zod';
import { RematchStatus, TicketStatus } from '@prisma/client';
import { allowRoles } from '../../middlewares/admin-auth';
import { paginationSchema } from '../../utils/pagination';
import { audit } from '../audit/audit.service';
import { adminBattlesQuerySchema, battleIdParamsSchema, cancelBattleSchema } from './battles.schemas';
import * as battlesService from './battles.service';
import * as adminBattles from './battles.admin.service';
import { adminCancelRematch } from './rematch.service';

const canManage = allowRoles('SUPER_ADMIN', 'ADMIN');
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(200) });

// Dashboard: /api/admin/battles
export const battlesAdminRouter = Router();

battlesAdminRouter.get('/', async (req, res) => {
  const query = adminBattlesQuerySchema.parse(req.query);
  res.json({ data: await battlesService.adminListBattles(query) });
});

battlesAdminRouter.get('/:id', async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  res.json({ data: await adminBattles.adminBattleDetail(id) });
});

battlesAdminRouter.post('/:id/cancel', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { reason } = cancelBattleSchema.parse(req.body);
  await battlesService.cancelBattle(id, reason);
  await audit(req, { action: 'battle.cancel', entityType: 'battle', entityId: id, summary: `Cancelled battle: ${reason}` });
  res.json({ data: await adminBattles.adminBattleDetail(id) });
});

battlesAdminRouter.post('/:id/close', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const battle = await adminBattles.closeBattleNow(id);
  await audit(req, { action: 'battle.close', entityType: 'battle', entityId: id, summary: 'Closed voting now' });
  res.json({ data: battle });
});

battlesAdminRouter.post('/:id/extend', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { hours } = z.object({ hours: z.number().int().min(1).max(72) }).parse(req.body);
  const battle = await adminBattles.extendBattle(id, hours);
  await audit(req, { action: 'battle.extend', entityType: 'battle', entityId: id, summary: `Extended voting by ${hours}h` });
  res.json({ data: battle });
});

// Dashboard: /api/admin/entries
export const entriesAdminRouter = Router();

entriesAdminRouter.get('/', async (req, res) => {
  const query = paginationSchema
    .extend({
      status: z.enum(TicketStatus).optional(),
      gameId: z.string().max(30).optional(),
      userId: z.string().max(30).optional(),
      q: z.string().trim().max(100).optional(),
    })
    .parse(req.query);
  res.json({ data: await adminBattles.adminListEntries(query) });
});

entriesAdminRouter.post('/:id/cancel', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { reason } = reasonSchema.parse(req.body);
  await adminBattles.adminCancelEntry(id, reason);
  await audit(req, { action: 'entry.cancel', entityType: 'entry', entityId: id, summary: `Cancelled battle entry: ${reason}` });
  res.json({ data: { ok: true } });
});

/** Clips the admin can put against a waiting entry. */
entriesAdminRouter.get('/:id/candidates', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(req.query);
  res.json({ data: await adminBattles.adminMatchCandidates(id, q || undefined) });
});

/** Admin picks the opponent: starts the battle now. Body: { clipId }. */
entriesAdminRouter.post('/:id/match', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { clipId } = z.object({ clipId: z.string().min(1).max(30) }).parse(req.body);
  const result = await adminBattles.adminMatchEntry(id, clipId);
  await audit(req, { action: 'entry.match', entityType: 'battle', entityId: result.battleId, summary: `Matched waiting entry ${id} with clip ${clipId} by hand` });
  res.status(201).json({ data: result });
});

// Dashboard: /api/admin/rematches
export const rematchesAdminRouter = Router();

rematchesAdminRouter.get('/', async (req, res) => {
  const query = paginationSchema
    .extend({ status: z.enum(RematchStatus).optional(), userId: z.string().max(30).optional() })
    .parse(req.query);
  res.json({ data: await adminBattles.adminListRematches(query) });
});

rematchesAdminRouter.post('/:id/cancel', canManage, async (req, res) => {
  const { id } = battleIdParamsSchema.parse(req.params);
  const { reason } = reasonSchema.parse(req.body);
  await adminCancelRematch(id);
  await audit(req, { action: 'rematch.cancel', entityType: 'rematch', entityId: id, summary: `Cancelled rematch: ${reason}` });
  res.json({ data: { ok: true } });
});
