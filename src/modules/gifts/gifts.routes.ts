import { Router } from 'express';
import { getGiftCatalog } from '../store/catalog.service';
import { getPopularity } from './popularity.service';

// Mobile: /api/v1/gifts and /api/v1/me/popularity
// Sending a gift = buying it: POST /v1/store/purchases with `gift: { recipientId } | { battleId, side }`.
const router = Router();

router.get('/gifts', async (_req, res) => {
  res.json({ data: await getGiftCatalog() });
});

router.get('/me/popularity', async (req, res) => {
  res.json({ data: await getPopularity(req.user!.id) });
});

export default router;
