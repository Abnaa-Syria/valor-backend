import { Router } from 'express';
import { z } from 'zod';
import { adminClipsQuerySchema, clipIdParamsSchema } from './clips.schemas';
import * as clipsService from './clips.service';

// Dashboard: /api/admin/clips (all admin roles, moderators included)
const router = Router();

const removeSchema = z.object({ reason: z.string().trim().min(3).max(200) });

router.get('/', async (req, res) => {
  const query = adminClipsQuerySchema.parse(req.query);
  res.json({ data: await clipsService.adminListClips(query) });
});

router.post('/:id/remove', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const { reason } = removeSchema.parse(req.body);
  await clipsService.adminRemoveClip(id, reason);
  res.json({ data: { ok: true } });
});

export default router;
