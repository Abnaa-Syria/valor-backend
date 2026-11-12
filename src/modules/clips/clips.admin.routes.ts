import { Router } from 'express';
import { z } from 'zod';
import { CommentStatus } from '@prisma/client';
import { paginationSchema } from '../../utils/pagination';
import { audit } from '../audit/audit.service';
import { adminClipsQuerySchema, clipIdParamsSchema } from './clips.schemas';
import * as clipsService from './clips.service';
import * as adminClips from './clips.admin.service';

// Dashboard: /api/admin/clips and /api/admin/comments (all admin roles, moderators included)
export const clipsAdminRouter = Router();
const reasonSchema = z.object({ reason: z.string().trim().min(3).max(200) });

clipsAdminRouter.get('/', async (req, res) => {
  const query = adminClipsQuerySchema.parse(req.query);
  res.json({ data: await clipsService.adminListClips(query) });
});

clipsAdminRouter.get('/:id', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  res.json({ data: await adminClips.adminGetClip(id) });
});

clipsAdminRouter.patch('/:id', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const input = adminClips.adminUpdateClipSchema.parse(req.body);
  const clip = await adminClips.adminUpdateClip(id, input);
  await audit(req, { action: 'clip.update', entityType: 'clip', entityId: id, summary: `Edited clip "${clip.title}"`, details: input });
  res.json({ data: clip });
});

clipsAdminRouter.post('/:id/remove', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const { reason } = reasonSchema.parse(req.body);
  await clipsService.adminRemoveClip(id, reason);
  await audit(req, { action: 'clip.remove', entityType: 'clip', entityId: id, summary: `Removed clip: ${reason}` });
  res.json({ data: { ok: true } });
});

clipsAdminRouter.post('/:id/restore', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const clip = await adminClips.adminRestoreClip(id);
  await audit(req, { action: 'clip.restore', entityType: 'clip', entityId: id, summary: `Restored clip "${clip.title}"` });
  res.json({ data: clip });
});

export const commentsAdminRouter = Router();

commentsAdminRouter.get('/', async (req, res) => {
  const query = paginationSchema
    .extend({
      q: z.string().trim().max(100).optional(),
      clipId: z.string().max(30).optional(),
      userId: z.string().max(30).optional(),
      status: z.enum(CommentStatus).optional(),
    })
    .parse(req.query);
  res.json({ data: await adminClips.adminListComments(query) });
});

commentsAdminRouter.post('/:id/remove', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  await adminClips.adminSetCommentStatus(id, 'REMOVED');
  await audit(req, { action: 'comment.remove', entityType: 'comment', entityId: id, summary: 'Removed a comment' });
  res.json({ data: { ok: true } });
});

commentsAdminRouter.post('/:id/restore', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  await adminClips.adminSetCommentStatus(id, 'VISIBLE');
  await audit(req, { action: 'comment.restore', entityType: 'comment', entityId: id, summary: 'Restored a comment' });
  res.json({ data: { ok: true } });
});
