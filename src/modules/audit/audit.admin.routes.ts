import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination';
import { auditEntityTypes, listAudit } from './audit.service';

// Dashboard: /api/admin/audit
const router = Router();

router.get('/', async (req, res) => {
  const query = paginationSchema
    .extend({
      adminId: z.string().max(30).optional(),
      entityType: z.string().max(30).optional(),
      entityId: z.string().max(30).optional(),
      q: z.string().trim().max(100).optional(),
    })
    .parse(req.query);
  res.json({ data: await listAudit(query) });
});

router.get('/entity-types', async (_req, res) => {
  res.json({ data: await auditEntityTypes() });
});

export default router;
