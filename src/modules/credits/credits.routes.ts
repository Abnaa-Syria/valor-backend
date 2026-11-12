import { Router } from 'express';
import { ledgerQuerySchema } from './credits.schemas';
import * as creditsService from './credits.service';

// Mobile: /api/v1/wallet
const router = Router();

router.get('/', async (req, res) => {
  res.json({ data: await creditsService.getWallet(req.user!.id) });
});

router.get('/transactions', async (req, res) => {
  const query = ledgerQuerySchema.parse(req.query);
  res.json({ data: await creditsService.listLedger(req.user!.id, query) });
});

export default router;
