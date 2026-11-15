import { Router } from 'express';
import { deviceSchema, registerDevice, unregisterDevice } from '../notifications/push.service';
import { z } from 'zod';
import { limits } from '../../middlewares/user-rate-limit';
import { galleryQuerySchema } from '../clips/clips.schemas';
import { listPlayerClips } from '../clips/clips.service';
import { getPlayerBadges } from '../badges/badges.service';
import { blockUser, listMyBlocks, unblockUser } from '../blocks/blocks.service';
import { updateMeSchema, userIdParamsSchema } from './users.schemas';
import * as usersService from './users.service';
import { deleteAccount } from './account-deletion.service';
import { imageUpload } from './image-upload';

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
router.post('/me/avatar', limits.profileImage, imageUpload, async (req, res) => {
  res.json({ data: await usersService.setProfileImage(req.user!.id, 'avatar', req.file?.filename) });
});

router.post('/me/banner', limits.profileImage, imageUpload, async (req, res) => {
  res.json({ data: await usersService.setProfileImage(req.user!.id, 'banner', req.file?.filename) });
});

router.get('/me/badges', async (req, res) => {
  res.json({ data: await getPlayerBadges(req.user!.id) });
});

/** Players who joined with my invite link, newest first (design 18). */
router.get('/me/referrals', async (req, res) => {
  res.json({ data: await usersService.listMyReferrals(req.user!.id) });
});

/** Players I blocked (settings). */
router.get('/me/blocks', async (req, res) => {
  res.json({ data: await listMyBlocks(req.user!.id) });
});

/** Delete my account (App Store / Google Play requirement). Body: { password }. */
/** Push notifications: register this phone (FCM token) / forget it on sign-out. */
router.post('/me/devices', async (req, res) => {
  res.json({ data: await registerDevice(req.user!.id, deviceSchema.parse(req.body)) });
});
router.delete('/me/devices', async (req, res) => {
  const { token } = deviceSchema.pick({ token: true }).parse(req.body ?? {});
  res.json({ data: await unregisterDevice(req.user!.id, token) });
});

router.post('/me/delete', async (req, res) => {
  const { password } = z.object({ password: z.string().min(1).max(100) }).parse(req.body);
  await deleteAccount(req.user!.id, { password });
  res.json({ data: { deleted: true } });
});

router.get('/players/:id/badges', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await getPlayerBadges(id) });
});

router.get('/players/:id', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await usersService.getPublicProfile(req.user!.id, id) });
});

router.get('/players/:id/clips', async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  const query = galleryQuerySchema.parse(req.query);
  res.json({ data: await listPlayerClips(req.user!.id, id, query) });
});

router.post('/players/:id/block', limits.block, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await blockUser(req.user!.id, id) });
});

router.delete('/players/:id/block', limits.block, async (req, res) => {
  const { id } = userIdParamsSchema.parse(req.params);
  res.json({ data: await unblockUser(req.user!.id, id) });
});

export default router;
