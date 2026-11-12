import { Router } from 'express';
import { storage } from '../../lib/storage';
import { errors } from '../../utils/app-error';
import { allowRoles } from '../../middlewares/admin-auth';
import { makeImageUpload } from '../users/image-upload';

// Dashboard: /api/admin/uploads
// Artwork for the catalog: frame rings, avatars, gift / badge / game icons.
const router = Router();
const CATALOG_PREFIX = 'catalog';
const catalogUpload = makeImageUpload(CATALOG_PREFIX);

/** multipart `image` (png with transparency for frames) → { url } to save on the item. */
router.post('/', allowRoles('SUPER_ADMIN', 'ADMIN'), catalogUpload, async (req, res) => {
  if (!req.file) throw errors.badRequest('Send an image in the "image" field');
  res.status(201).json({ data: { url: storage.url(storage.keyFor(CATALOG_PREFIX, req.file.filename)) } });
});

export default router;
