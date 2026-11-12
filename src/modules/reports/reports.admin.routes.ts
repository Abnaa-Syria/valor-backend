import { Router } from 'express';
import { adminReportsQuerySchema, reportIdParamsSchema, resolveReportSchema } from './reports.schemas';
import * as reportsService from './reports.service';

// Dashboard: /api/admin/reports (all admin roles, moderators included)
const router = Router();

router.get('/', async (req, res) => {
  const query = adminReportsQuerySchema.parse(req.query);
  res.json({ data: await reportsService.adminListReports(query) });
});

router.patch('/:id', async (req, res) => {
  const { id } = reportIdParamsSchema.parse(req.params);
  const input = resolveReportSchema.parse(req.body);
  res.json({ data: await reportsService.resolveReport(id, req.admin!.id, input) });
});

export default router;
