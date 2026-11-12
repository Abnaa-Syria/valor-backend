import { Router } from 'express';
import * as statsService from './stats.service';

const router = Router();

router.get('/overview', async (_req, res) => {
  res.json({ data: await statsService.getOverview() });
});

export default router;
