import { Router } from 'express';
import { galleryQuerySchema } from '../clips/clips.schemas';
import { listPlayerClips } from '../clips/clips.service';
import { updateMeSchema, userIdParamsSchema } from './users.schemas';
import * as usersService from './users.service';
import { imageUpload } from './image-upload';
import { getPlayerBadges } from '../badges/badges.service';

// Mobile: /api/v1/me and /api/v1/players
const router = Router();

router.get('/me', async (req, res) => {
  res.json({ data: await usersService.getMe(req.user!.id) });
});

router.patch('/me', async (req, res) => {
  const input = updateMeSchema.parse(req.body);
  res.json({ data: await usersService.updateMe(req.user!.id, input) });
});

/** multipart: `image` (jpeg / png / webp, max 5 MB) */
router.post('/me/avatar', imageUpload, async (req, res) => {
  res.json({ data: await usersService.setProfileImage(req.user!.id, 'avatar', req.file?.filename) });
});

router.post('/me/banner', imageUpload, async (req, res) => {
  res.json({ data: await usersService.setProfileImage(req.user!.id, 'banner', req.file?.filename) });
});

router.get('/me/badges', async (req, res) => {
  res.json({ data: await getPlayerBadges(req.user!.id) });
});

router.get('/players/:id/badges', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await getPlayerBadges(id) });
});

router.get('/players/:id', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await usersService.getPublicProfile(id) });
});

router.get('/players/:id/clips', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const query = galleryQuerySchema.parse(req.query);
  res.json({ data: await listPlayerClips(req.user!.id, id, query) });
});

export default router;
