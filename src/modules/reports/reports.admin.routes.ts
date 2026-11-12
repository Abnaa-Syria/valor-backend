import { Router } from 'express';
import { audit } from '../audit/audit.service';
import { adminReportsQuerySchema, reportIdParamsSchema, resolveReportSchema } from './reports.schemas';
import * as reportsService from './reports.service';

// Dashboard: /api/admin/reports (all admin roles, moderators included)
const router = Router();

router.get('/', async (req, res) => {
  const query = adminReportsQuerySchema.parse(req.query);
  res.json({ data: await reportsService.adminListReports(query) });
});

router.get('/:id', async (req, res) => {
  const { id } = reportIdParamsSchema.parse(req.params);
  res.json({ data: await reportsService.adminGetReport(id) });
});

router.patch('/:id', async (req, res) => {
  const { id } = reportIdParamsSchema.parse(req.params);
  const input = resolveReportSchema.parse(req.body);
  const report = await reportsService.resolveReport(id, req.admin!.id, input);
  await audit(req, {
    action: `report.${input.status.toLowerCase()}`,
    entityType: 'report',
    entityId: id,
    summary: `${input.status === 'RESOLVED' ? 'Resolved' : 'Dismissed'} ${report.targetType.toLowerCase()} report${input.removeContent ? ' and removed the content' : ''}`,
  });
  res.json({ data: report });
});

export default router;
