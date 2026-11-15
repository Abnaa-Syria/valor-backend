import { Router } from 'express';
import { idempotent } from '../../middlewares/idempotency';
import { paginationSchema } from '../../utils/pagination';
import { clipUpload, uploadedFiles } from './clip-upload';
import {
  clipIdParamsSchema,
  commentParamsSchema,
  createCommentSchema,
  feedQuerySchema,
  galleryQuerySchema,
  updateClipSchema,
} from './clips.schemas';
import * as clipsService from './clips.service';
import { limits } from '../../middlewares/user-rate-limit';

// Mobile: /api/v1/clips
const router = Router();

/**
 * multipart/form-data:
 *   video (file, required) · thumbnail (image, optional)
 *   gameId · title · description? · durationSec? · battle? (JSON {"weaponClass","rank"})
 * Needs an Idempotency-Key header, because with `battle` it spends a Challenge Credit.
 */
router.post('/', limits.clipUpload, idempotent('clips.create'), clipUpload, async (req, res) => {
  // The service validates the fields itself, so it can delete the saved files if anything fails.
  const result = await clipsService.createClip(req.user!.id, req.body, uploadedFiles(req.files));
  res.status(201).json({ data: result });
});

/** Public feed for Home: ?sort=trending|latest&gameId= */
router.get('/', async (req, res) => {
  const query = feedQuerySchema.parse(req.query);
  res.json({ data: await clipsService.listFeed(req.user!.id, query) });
});

router.get('/mine', async (req, res) => {
  const query = galleryQuerySchema.parse(req.query);
  res.json({ data: await clipsService.listMyClips(req.user!.id, query) });
});

router.get('/:id', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  res.json({ data: await clipsService.getClip(req.user!.id, id) });
});

router.patch('/:id', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const input = updateClipSchema.parse(req.body);
  res.json({ data: await clipsService.updateClip(req.user!.id, id, input) });
});

router.delete('/:id', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  await clipsService.deleteClip(req.user!.id, id);
  res.json({ data: { ok: true } });
});

router.post('/:id/like', limits.like, async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  res.json({ data: await clipsService.likeClip(req.user!.id, id) });
});

router.delete('/:id/like', limits.like, async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  res.json({ data: await clipsService.unlikeClip(req.user!.id, id) });
});

router.get('/:id/comments', async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const query = paginationSchema.parse(req.query);
  res.json({ data: await clipsService.listComments(req.user!.id, id, query) });
});

router.post('/:id/comments', limits.comment, async (req, res) => {
  const { id } = clipIdParamsSchema.parse(req.params);
  const { body } = createCommentSchema.parse(req.body);
  res.status(201).json({ data: await clipsService.addComment(req.user!.id, id, body) });
});

router.post('/:id/comments/:commentId/like', limits.like, async (req, res) => {
  const { id, commentId } = commentParamsSchema.parse(req.params);
  res.json({ data: await clipsService.setCommentLike(req.user!.id, id, commentId, true) });
});

router.delete('/:id/comments/:commentId/like', limits.like, async (req, res) => {
  const { id, commentId } = commentParamsSchema.parse(req.params);
  res.json({ data: await clipsService.setCommentLike(req.user!.id, id, commentId, false) });
});

router.delete('/:id/comments/:commentId', async (req, res) => {
  const { id, commentId } = commentParamsSchema.parse(req.params);
  await clipsService.deleteComment(req.user!.id, id, commentId);
  res.json({ data: { ok: true } });
});

export default router;
