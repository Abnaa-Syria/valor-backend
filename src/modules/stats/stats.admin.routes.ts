import { Router } from 'express';
import * as statsService from './stats.service';

const router = Router();

router.get('/overview', async (_req, res) => {
  res.json({ data: await statsService.getOverview() });
});

router.get('/timeseries', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 7), 90);
  res.json({ data: await statsService.getTimeseries(days) });
});

export default router;
