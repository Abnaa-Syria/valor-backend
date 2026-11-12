import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination';
import * as notificationsService from './notifications.service';

// Mobile: /api/v1/notifications
const router = Router();

const listQuerySchema = paginationSchema.extend({
  unreadOnly: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});
const markReadSchema = z.object({ ids: z.array(z.string().min(1).max(30)).max(100).optional() });

router.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.json({ data: await notificationsService.listNotifications(req.user!.id, query) });
});

router.get('/unread-count', async (req, res) => {
  res.json({ data: { unreadCount: await notificationsService.unreadCount(req.user!.id) } });
});

router.post('/read', async (req, res) => {
  const { ids } = markReadSchema.parse(req.body ?? {});
  res.json({ data: await notificationsService.markRead(req.user!.id, ids) });
});

export default router;
