import { Router } from 'express';
import { createReportSchema } from './reports.schemas';
import * as reportsService from './reports.service';

// Mobile: /api/v1/reports
const router = Router();

router.post('/', async (req, res) => {
  const input = createReportSchema.parse(req.body);
  res.status(201).json({ data: await reportsService.createReport(req.user!.id, input) });
});

export default router;
