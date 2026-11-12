import { Router } from 'express';
import { z } from 'zod';
import { allowRoles } from '../../middlewares/admin-auth';
import { paginationSchema } from '../../utils/pagination';
import { adminAdjustSchema, ledgerQuerySchema } from '../credits/credits.schemas';
import { listLedger } from '../credits/credits.service';
import { awardBadge, revokeBadge } from '../badges/badges.service';
import { audit } from '../audit/audit.service';
import { deleteAccount } from './account-deletion.service';
import { updateUserStatusSchema, userIdParamsSchema } from './users.schemas';
import * as controller from './users.controller';
import * as usersService from './users.service';
import * as adminPlayers from './users.admin.service';

// Dashboard: /api/admin/users
const router = Router();
const canManage = allowRoles('SUPER_ADMIN', 'ADMIN');

router.get('/', controller.list);

router.post('/', canManage, async (req, res) => {
  const input = adminPlayers.adminCreatePlayerSchema.parse(req.body);
  const player = await adminPlayers.createPlayer(input);
  await audit(req, { action: 'player.create', entityType: 'player', entityId: player.id, summary: `Created player ${player.username}` });
  res.status(201).json({ data: player });
});

router.get('/:id', controller.getOne);

router.patch('/:id', canManage, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const input = adminPlayers.adminUpdatePlayerSchema.parse(req.body);
  const player = await adminPlayers.updatePlayer(id, input);
  await audit(req, { action: 'player.update', entityType: 'player', entityId: id, summary: `Edited player ${player.username}`, details: input });
  res.json({ data: player });
});

router.patch('/:id/status', canManage, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const { status } = updateUserStatusSchema.parse(req.body);
  const player = await usersService.updateUserStatus(id, status);
  await audit(req, { action: `player.status.${status.toLowerCase()}`, entityType: 'player', entityId: id, summary: `Set ${player.username} to ${status}` });
  res.json({ data: player });
});

router.post('/:id/password', canManage, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const { password } = z.object({ password: z.string().min(8).max(100) }).parse(req.body);
  await adminPlayers.setPassword(id, password);
  await audit(req, { action: 'player.password.set', entityType: 'player', entityId: id, summary: 'Set a new password (all sessions signed out)' });
  res.json({ data: { ok: true } });
});

router.post('/:id/password-reset', canManage, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  await adminPlayers.sendPasswordReset(id);
  await audit(req, { action: 'player.password.reset-link', entityType: 'player', entityId: id, summary: 'Sent a password reset link' });
  res.json({ data: { ok: true } });
});

router.delete('/:id', allowRoles('SUPER_ADMIN'), async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const { reason } = z.object({ reason: z.string().trim().min(3).max(200) }).parse(req.body ?? {});
  await deleteAccount(id, { byAdmin: true });
  await audit(req, { action: 'player.delete', entityType: 'player', entityId: id, summary: `Deleted account: ${reason}` });
  res.json({ data: { deleted: true } });
});

router.get('/:id/export', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const data = await adminPlayers.exportPlayer(id);
  await audit(req, { action: 'player.export', entityType: 'player', entityId: id, summary: 'Exported player data' });
  res.json({ data });
});

router.get('/:id/ledger', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const query = ledgerQuerySchema.parse(req.query);
  res.json({ data: await listLedger(id, query) });
});

router.post('/:id/credits', canManage, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const input = adminAdjustSchema.parse(req.body);
  const wallet = await usersService.adjustCredits(id, input, req.admin!.name);
  await audit(req, {
    action: 'player.credits.adjust',
    entityType: 'player',
    entityId: id,
    summary: `${input.amount > 0 ? 'Added' : 'Deducted'} ${Math.abs(input.amount)} ${input.type.toLowerCase()} credits: ${input.note}`,
  });
  res.json({ data: wallet });
});

router.get('/:id/gifts', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const query = paginationSchema.extend({ direction: z.enum(['received', 'sent']).default('received') }).parse(req.query);
  res.json({ data: await adminPlayers.listPlayerGifts(id, query.direction, query) });
});

router.get('/:id/blocks', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await adminPlayers.listPlayerBlocks(id) });
});

router.post('/:id/badges', canManage, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const { badgeId } = z.object({ badgeId: z.string().min(1).max(30) }).parse(req.body);
  await awardBadge(id, badgeId, req.admin!.id);
  await audit(req, { action: 'player.badge.award', entityType: 'player', entityId: id, summary: 'Awarded a badge', details: { badgeId } });
  res.status(201).json({ data: { ok: true } });
});

router.delete('/:id/badges/:badgeId', canManage, async (req, res) => {
  const { id, badgeId } = z.object({ id: z.string().min(1).max(30), badgeId: z.string().min(1).max(30) }).parse(req.params);
  await revokeBadge(id, badgeId);
  await audit(req, { action: 'player.badge.remove', entityType: 'player', entityId: id, summary: 'Removed a badge', details: { badgeId } });
  res.json({ data: { ok: true } });
});

export default router;
