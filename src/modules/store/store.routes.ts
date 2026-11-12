import { Router } from 'express';
import { idempotent } from '../../middlewares/idempotency';
import { paginationSchema } from '../../utils/pagination';
import * as storeService from './store.service';
import { limits } from '../../middlewares/user-rate-limit';

// Mobile: /api/v1/store
const router = Router();

/** Wallet + credit packs (design 19–20). Gifts: /v1/gifts · frames & themes: /v1/cosmetics. */
router.get('/', async (req, res) => {
  res.json({ data: await storeService.getStoreFront(req.user!.id) });
});

/**
 * Deliver a store purchase after the app completed it with Apple / Google.
 * { provider, productId, transactionId, receipt?, quantity?, gift?: { recipientId } | { battleId, side } }
 */
router.post('/purchases', limits.purchase, idempotent('store.purchase'), async (req, res) => {
  const input = storeService.purchaseSchema.parse(req.body);
  res.status(201).json({ data: await storeService.purchase(req.user!.id, input) });
});

router.get('/purchases', async (req, res) => {
  const query = paginationSchema.parse(req.query);
  res.json({ data: await storeService.listMyPurchases(req.user!.id, query) });
});

export default router;
